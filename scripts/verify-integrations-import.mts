import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import {
  buildTreeFromNotes,
  collectDocumentIds,
  countSelectedDocuments,
  flattenTree,
  runTreeImport,
  type ImportedNoteTree,
} from "../src/lib/import/run-tree-import";
import { parseEnex } from "../src/lib/import/enex";
import { parseImportFile } from "../src/lib/import/parse-file";
import { markdownToHtml, plainTextToHtml } from "../src/lib/import/markdown";
import {
  collectRecords,
  detectContentType,
  extractContent,
  pickArgumentName,
  readString,
  readStringArray,
  readTimestamp,
} from "../src/lib/evernote/payload";
import {
  resolveImportPlacement,
  resolveNotebookParentId,
  shouldImportAsNotebook,
  type ImportRole,
} from "../src/lib/notion/classify-import";
import { htmlToBlocks, spansPlainText } from "../src/lib/import/html-blocks";
import { parseMarkup } from "../src/lib/import/dom";
import { TRANSLATIONS, type TranslationKey } from "../src/lib/i18n/translations";
import type { DataAdapter } from "../src/lib/data/adapter";
import type { ImportTreeNode, Notebook, Page, SupportedLanguage } from "../src/types/models";
import type { ImportedNote } from "../src/lib/import/types";

function run(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result instanceof Promise) {
    return result.then(() => console.log(`  ok  ${name}`));
  }
  console.log(`  ok  ${name}`);
  return Promise.resolve();
}

interface RecordedNotebook {
  id: string;
  name: string;
  parentId: string | null;
}

interface RecordedPage {
  id: string;
  title: string;
  notebookId: string | null;
  parentPageId: string | null;
}

function fakeAdapter(existing: RecordedNotebook[] = []) {
  const notebooks: RecordedNotebook[] = [...existing];
  const pages: RecordedPage[] = [];
  let notebookSeq = existing.length;
  let pageSeq = 0;
  const jobs: { provider: string; totalPages: number }[] = [];

  const adapter = {
    mode: "local" as const,
    workspaceId: "ws_test",
    async createNotebook(input: { name: string; emoji?: string; parentId?: string | null }) {
      notebookSeq += 1;
      const notebook: RecordedNotebook = {
        id: `nb_${notebookSeq}`,
        name: input.name,
        parentId: input.parentId ?? null,
      };
      notebooks.push(notebook);
      return notebook as unknown as Notebook;
    },
    async createPage(input: {
      title?: string;
      notebookId?: string | null;
      parentPageId?: string | null;
    }) {
      pageSeq += 1;
      const page: RecordedPage = {
        id: `page_${pageSeq}`,
        title: input.title ?? "",
        notebookId: input.notebookId ?? null,
        parentPageId: input.parentPageId ?? null,
      };
      pages.push(page);
      return page as unknown as Page;
    },
    async updatePage() {},
    async uploadAttachment() {
      return { url: "https://example.test/file" };
    },
    async recordCompletedImportJob(input: { provider: string; totalPages: number }) {
      jobs.push({ provider: input.provider, totalPages: input.totalPages });
      return "job_test";
    },
  };

  return { adapter: adapter as unknown as DataAdapter, notebooks, pages, jobs };
}

function noteFor(node: ImportTreeNode, body = "<p>conteudo</p>"): ImportedNote {
  return {
    sourceId: node.id,
    title: node.title,
    blocks: htmlToBlocks(parseMarkup(body, { xml: false })),
    tags: [],
    assets: [],
    source: "html",
    sourceFileName: node.title,
    warnings: [],
  };
}

function enexXml(titles: string[], notebook?: string): string {
  const notes = titles
    .map(
      (title) =>
        `<note><title>${title}</title>` +
        (notebook ? `<notebook>${notebook}</notebook>` : "") +
        `<content><![CDATA[<?xml version="1.0" encoding="UTF-8"?>` +
        `<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">` +
        `<en-note><p>${title}</p></en-note>]]></content>` +
        `<created>20240102T030405Z</created></note>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><en-export>${notes}</en-export>`;
}

function enexFile(name: string, titles: string[]): File {
  return new File([enexXml(titles)], name, { type: "text/xml" });
}

function enexNote(title: string, containerPath: string[] | undefined): ImportedNote {
  return {
    sourceId: `enex_${title}`,
    title,
    blocks: htmlToBlocks(parseMarkup(`<p>${title}</p>`, { xml: false })),
    tags: [],
    assets: [],
    source: "evernote",
    sourceFileName: "export.enex",
    ...(containerPath ? { containerPath } : {}),
    warnings: [],
  };
}

const driveTree: ImportTreeNode[] = [
  {
    id: "folder_trabalho",
    title: "Trabalho",
    kind: "container",
    children: [
      {
        id: "folder_projetos",
        title: "Projetos",
        kind: "container",
        children: [{ id: "doc_plano", title: "Plano", kind: "document" }],
      },
      { id: "doc_resumo", title: "Resumo", kind: "document" },
    ],
  },
  {
    id: "folder_pessoal",
    title: "Pessoal",
    kind: "container",
    children: [{ id: "doc_diario", title: "Diário", kind: "document" }],
  },
];

const evernoteTree: ImportTreeNode[] = [
  {
    id: "stack_estudos",
    title: "Estudos",
    kind: "container",
    children: [
      {
        id: "nb_faculdade",
        title: "Faculdade",
        kind: "container",
        children: [
          { id: "note_calculo", title: "Cálculo", kind: "document" },
          { id: "note_fisica", title: "Física", kind: "document" },
        ],
      },
    ],
  },
  {
    id: "nb_pessoal",
    title: "Pessoal",
    kind: "container",
    children: [{ id: "note_viagem", title: "Viagem", kind: "document" }],
  },
];

async function main() {
  await run("flatten and count helpers walk the whole tree", () => {
    assert.equal(flattenTree(driveTree).length, 6);
    assert.deepEqual(collectDocumentIds(driveTree), ["doc_plano", "doc_resumo", "doc_diario"]);
    assert.equal(countSelectedDocuments(driveTree, new Set(["doc_plano", "doc_diario"])), 2);
    assert.equal(countSelectedDocuments(driveTree, new Set(["folder_trabalho"])), 0);
  });

  await run("google docs turns a tabbed file into a notebook of notes", async () => {
    const { adapter, notebooks, pages } = fakeAdapter();

    const results = await runTreeImport({
      adapter,
      roots: driveTree,
      selectedIds: new Set(["doc_plano", "doc_resumo"]),
      targetNotebookId: null,
      preserveStructure: true,
      uploadMedia: false,
      keepTags: true,
      fallbackTitle: "Google Doc",
      provider: "google_docs",
      fetchNote: async (node): Promise<ImportedNoteTree> => {
        if (node.id !== "doc_plano") return { note: noteFor(node) };
        return {
          container: { title: node.title, icon: "📘" },
          children: [
            {
              note: { ...noteFor(node), sourceId: "doc_plano:tab1", title: "Guia 1" },
              children: [
                { note: { ...noteFor(node), sourceId: "doc_plano:tab1:a", title: "Guia 1.1" } },
              ],
            },
            { note: { ...noteFor(node), sourceId: "doc_plano:tab2", title: "Guia 2" } },
          ],
        };
      },
    });

    assert.equal(results.filter((item) => item.status === "error").length, 0);

    const trabalho = notebooks.find((nb) => nb.name === "Trabalho");
    const projetos = notebooks.find((nb) => nb.name === "Projetos");
    const plano = notebooks.find((nb) => nb.name === "Plano");
    assert.ok(trabalho && projetos && plano);
    assert.equal(plano.parentId, projetos.id);

    assert.equal(pages.find((page) => page.title === "Plano"), undefined);

    const guia1 = pages.find((page) => page.title === "Guia 1");
    const guia11 = pages.find((page) => page.title === "Guia 1.1");
    const guia2 = pages.find((page) => page.title === "Guia 2");
    assert.ok(guia1 && guia11 && guia2);

    assert.equal(guia1.notebookId, plano.id);
    assert.equal(guia1.parentPageId, null);
    assert.equal(guia11.notebookId, plano.id);
    assert.equal(guia11.parentPageId, guia1.id);
    assert.equal(guia2.notebookId, plano.id);
    assert.equal(guia2.parentPageId, null);

    const resumo = pages.find((page) => page.title === "Resumo");
    assert.equal(resumo?.notebookId, trabalho.id);
  });

  await run("google docs keeps a single-tab file as one note", async () => {
    const { adapter, notebooks, pages } = fakeAdapter();

    await runTreeImport({
      adapter,
      roots: driveTree,
      selectedIds: new Set(["doc_diario"]),
      targetNotebookId: null,
      preserveStructure: true,
      uploadMedia: false,
      keepTags: true,
      fallbackTitle: "Google Doc",
      provider: "google_docs",
      fetchNote: async (node) => ({ note: noteFor(node) }),
    });

    assert.deepEqual(
      notebooks.map((nb) => nb.name),
      ["Pessoal"]
    );
    assert.equal(pages.length, 1);
    assert.equal(pages[0].title, "Diário");
    assert.equal(pages[0].notebookId, notebooks[0].id);
  });

  await run("google docs import recreates folder > note > subnote", async () => {
    const { adapter, notebooks, pages, jobs } = fakeAdapter();

    const results = await runTreeImport({
      adapter,
      roots: driveTree,
      selectedIds: new Set(["doc_plano", "doc_resumo", "doc_diario"]),
      targetNotebookId: null,
      preserveStructure: true,
      uploadMedia: false,
      keepTags: true,
      fallbackTitle: "Google Doc",
      provider: "google_docs",
      fetchNote: async (node): Promise<ImportedNoteTree> => {
        if (node.id !== "doc_plano") return { note: noteFor(node) };
        return {
          note: noteFor(node),
          children: [
            {
              note: { ...noteFor(node), sourceId: "doc_plano:tab1", title: "Escopo" },
              children: [
                { note: { ...noteFor(node), sourceId: "doc_plano:tab1:a", title: "Riscos" } },
              ],
            },
            { note: { ...noteFor(node), sourceId: "doc_plano:tab2", title: "Cronograma" } },
          ],
        };
      },
    });

    assert.equal(results.filter((item) => item.status === "error").length, 0);

    const trabalho = notebooks.find((nb) => nb.name === "Trabalho");
    const projetos = notebooks.find((nb) => nb.name === "Projetos");
    const pessoal = notebooks.find((nb) => nb.name === "Pessoal");
    assert.ok(trabalho && projetos && pessoal);
    assert.equal(notebooks.length, 3);
    assert.equal(trabalho.parentId, null);
    assert.equal(projetos.parentId, trabalho.id);
    assert.equal(pessoal.parentId, null);

    const plano = pages.find((page) => page.title === "Plano");
    const escopo = pages.find((page) => page.title === "Escopo");
    const riscos = pages.find((page) => page.title === "Riscos");
    const cronograma = pages.find((page) => page.title === "Cronograma");
    const resumo = pages.find((page) => page.title === "Resumo");
    const diario = pages.find((page) => page.title === "Diário");
    assert.ok(plano && escopo && riscos && cronograma && resumo && diario);

    assert.equal(plano.notebookId, projetos.id);
    assert.equal(plano.parentPageId, null);
    assert.equal(escopo.parentPageId, plano.id);
    assert.equal(escopo.notebookId, projetos.id);
    assert.equal(riscos.parentPageId, escopo.id);
    assert.equal(cronograma.parentPageId, plano.id);
    assert.equal(resumo.notebookId, trabalho.id);
    assert.equal(resumo.parentPageId, null);
    assert.equal(diario.notebookId, pessoal.id);

    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].provider, "google_docs");
  });

  await run("structure off sends every note to the chosen notebook", async () => {
    const { adapter, notebooks, pages } = fakeAdapter();

    await runTreeImport({
      adapter,
      roots: driveTree,
      selectedIds: new Set(["doc_plano", "doc_resumo", "doc_diario"]),
      targetNotebookId: "nb_destino",
      preserveStructure: false,
      uploadMedia: false,
      keepTags: true,
      fallbackTitle: "Google Doc",
      provider: "google_docs",
      fetchNote: async (node) => ({ note: noteFor(node) }),
    });

    assert.equal(notebooks.length, 0);
    assert.equal(pages.length, 3);
    for (const page of pages) {
      assert.equal(page.notebookId, "nb_destino");
      assert.equal(page.parentPageId, null);
    }
  });

  await run("unselected branches never create notebooks", async () => {
    const { adapter, notebooks, pages } = fakeAdapter();

    await runTreeImport({
      adapter,
      roots: driveTree,
      selectedIds: new Set(["doc_diario"]),
      targetNotebookId: null,
      preserveStructure: true,
      uploadMedia: false,
      keepTags: true,
      fallbackTitle: "Google Doc",
      provider: "google_docs",
      fetchNote: async (node) => ({ note: noteFor(node) }),
    });

    assert.deepEqual(
      notebooks.map((nb) => nb.name),
      ["Pessoal"]
    );
    assert.equal(pages.length, 1);
    assert.equal(pages[0].title, "Diário");
  });

  await run("existing notebooks are reused instead of duplicated", async () => {
    const { adapter, notebooks, pages } = fakeAdapter([
      { id: "nb_existente", name: "Pessoal", parentId: null },
    ]);

    await runTreeImport({
      adapter,
      roots: driveTree,
      selectedIds: new Set(["doc_diario"]),
      targetNotebookId: null,
      preserveStructure: true,
      uploadMedia: false,
      keepTags: true,
      fallbackTitle: "Google Doc",
      provider: "google_docs",
      existingNotebooks: [
        { id: "nb_existente", name: "Pessoal", parentId: null } as unknown as Notebook,
      ],
      fetchNote: async (node) => ({ note: noteFor(node) }),
    });

    assert.equal(notebooks.length, 1);
    assert.equal(pages[0].notebookId, "nb_existente");
  });

  await run("evernote stacks and notebooks become nested notebooks", async () => {
    const { adapter, notebooks, pages } = fakeAdapter();

    await runTreeImport({
      adapter,
      roots: evernoteTree,
      selectedIds: new Set(["note_calculo", "note_fisica", "note_viagem"]),
      targetNotebookId: null,
      preserveStructure: true,
      uploadMedia: false,
      keepTags: true,
      fallbackTitle: "Evernote",
      provider: "evernote",
      fetchNote: async (node) => ({ note: noteFor(node) }),
    });

    const estudos = notebooks.find((nb) => nb.name === "Estudos");
    const faculdade = notebooks.find((nb) => nb.name === "Faculdade");
    assert.ok(estudos && faculdade);
    assert.equal(faculdade.parentId, estudos.id);
    assert.equal(pages.filter((page) => page.notebookId === faculdade.id).length, 2);
    for (const page of pages) assert.equal(page.parentPageId, null);
  });

  await run("failed notes are reported without aborting the run", async () => {
    const { adapter, pages } = fakeAdapter();

    const results = await runTreeImport({
      adapter,
      roots: evernoteTree,
      selectedIds: new Set(["note_calculo", "note_fisica", "note_viagem"]),
      targetNotebookId: null,
      preserveStructure: true,
      uploadMedia: false,
      keepTags: true,
      fallbackTitle: "Evernote",
      provider: "evernote",
      fetchNote: async (node) => {
        if (node.id === "note_fisica") throw new Error("boom");
        return { note: noteFor(node) };
      },
    });

    assert.equal(results.length, 3);
    assert.equal(results.filter((item) => item.status === "error").length, 1);
    assert.equal(pages.length, 2);
  });

  await run("enex files carry the notebook they came from", async () => {
    const single = await parseImportFile(
      enexFile("TJSP - Direito Administrativo.enex", ["Aula 1", "Aula 2"])
    );
    assert.equal(single.length, 2);
    for (const note of single) {
      assert.deepEqual(note.containerPath, ["TJSP - Direito Administrativo"]);
    }
    assert.deepEqual(
      single.map((note) => note.title),
      ["Aula 1", "Aula 2"]
    );

    const declared = parseEnex(enexXml(["Nota"], "Caderno Declarado"), "qualquer-nome.enex");
    assert.deepEqual(declared[0].containerPath, ["Caderno Declarado"]);

    const explicit = parseEnex(enexXml(["Nota"]), "arquivo.enex", ["Pilha", "Caderno"]);
    assert.deepEqual(explicit[0].containerPath, ["Pilha", "Caderno"]);
  });

  await run("enex zip folders become the notebooks above the file", async () => {
    const archive = zipSync({
      "Concursos/TJSP/Direito Administrativo.enex": strToU8(enexXml(["Aula 1", "Aula 2"])),
      "Concursos/SPTC Perito/Física.enex": strToU8(enexXml(["Cinemática"])),
      "Avulso.enex": strToU8(enexXml(["Solta"])),
      "__MACOSX/Concursos/._ignorar.enex": strToU8("lixo"),
    });

    const notes = await parseImportFile(
      new File([archive as unknown as BlobPart], "Evernote.zip", { type: "application/zip" }),
      "evernote"
    );

    const byTitle = new Map(notes.map((note) => [note.title, note.containerPath]));
    assert.deepEqual(byTitle.get("Aula 1"), ["Concursos", "TJSP", "Direito Administrativo"]);
    assert.deepEqual(byTitle.get("Aula 2"), ["Concursos", "TJSP", "Direito Administrativo"]);
    assert.deepEqual(byTitle.get("Cinemática"), ["Concursos", "SPTC Perito", "Física"]);
    assert.deepEqual(byTitle.get("Solta"), ["Avulso"]);
    assert.equal(notes.length, 4);
  });

  await run("enex notes group into nested notebooks", () => {
    const notes = [
      enexNote("Aula 1", ["Concursos", "TJSP", "Direito Administrativo"]),
      enexNote("Aula 2", ["Concursos", "TJSP", "Direito Administrativo"]),
      enexNote("Cinemática", ["Concursos", "SPTC Perito", "Física"]),
      enexNote("Solta", undefined),
    ];

    const { roots, notesById } = buildTreeFromNotes(notes);
    assert.equal(notesById.size, 4);

    const concursos = roots.find((node) => node.title === "Concursos");
    const solta = roots.find((node) => node.title === "Solta");
    assert.ok(concursos && solta);
    assert.equal(concursos.kind, "container");
    assert.equal(solta.kind, "document");

    const tjsp = concursos.children?.find((node) => node.title === "TJSP");
    assert.ok(tjsp);
    const direito = tjsp.children?.find((node) => node.title === "Direito Administrativo");
    assert.ok(direito);
    assert.deepEqual(
      direito.children?.map((node) => node.title),
      ["Aula 1", "Aula 2"]
    );
    assert.equal(collectDocumentIds(roots).length, 4);
  });

  await run("enex import creates caderno > nota under the chosen notebook", async () => {
    const { adapter, notebooks, pages, jobs } = fakeAdapter();
    const notes = [
      enexNote("Aula 1", ["Concursos", "TJSP", "Direito Administrativo"]),
      enexNote("Cinemática", ["Concursos", "SPTC Perito", "Física"]),
      enexNote("Solta", undefined),
    ];
    const { roots, notesById } = buildTreeFromNotes(notes);

    await runTreeImport({
      adapter,
      roots,
      selectedIds: new Set(collectDocumentIds(roots)),
      targetNotebookId: "nb_destino",
      preserveStructure: true,
      uploadMedia: false,
      keepTags: true,
      fallbackTitle: "Evernote",
      provider: "enex",
      fetchNote: async (node) => {
        const note = notesById.get(node.id);
        return note ? { note } : null;
      },
    });

    const concursos = notebooks.find((nb) => nb.name === "Concursos");
    const tjsp = notebooks.find((nb) => nb.name === "TJSP");
    const direito = notebooks.find((nb) => nb.name === "Direito Administrativo");
    const fisica = notebooks.find((nb) => nb.name === "Física");
    assert.ok(concursos && tjsp && direito && fisica);

    assert.equal(concursos.parentId, "nb_destino");
    assert.equal(tjsp.parentId, concursos.id);
    assert.equal(direito.parentId, tjsp.id);

    assert.equal(pages.find((page) => page.title === "Aula 1")?.notebookId, direito.id);
    assert.equal(pages.find((page) => page.title === "Cinemática")?.notebookId, fisica.id);
    assert.equal(pages.find((page) => page.title === "Solta")?.notebookId, "nb_destino");
    for (const page of pages) assert.equal(page.parentPageId, null);

    assert.equal(jobs[0].provider, "enex");
  });

  await run("notion keeps the same page > notebook > note > subnote placement", () => {
    const parents = new Map<string, string | null>([
      ["area", null],
      ["projeto", "area"],
      ["nota", "projeto"],
      ["subnota", "nota"],
    ]);
    const roles = new Map<string, ImportRole>([
      ["area", "notebook"],
      ["projeto", "notebook"],
      ["nota", "page"],
      ["subnota", "page"],
    ]);
    const idMap = new Map<string, string>([
      ["area", "nb_area"],
      ["projeto", "nb_projeto"],
      ["nota", "page_nota"],
    ]);

    assert.equal(
      resolveNotebookParentId({ notionId: "projeto", parents, roles, idMap }),
      "nb_area"
    );

    const notePlacement = resolveImportPlacement({
      notionId: "nota",
      parents,
      roles,
      idMap,
      fallbackNotebookId: null,
      preserveHierarchy: true,
    });
    assert.deepEqual(notePlacement, { notebookId: "nb_projeto", parentPageId: null });

    const subnotePlacement = resolveImportPlacement({
      notionId: "subnota",
      parents,
      roles,
      idMap,
      fallbackNotebookId: null,
      preserveHierarchy: true,
    });
    assert.deepEqual(subnotePlacement, { notebookId: "nb_projeto", parentPageId: "page_nota" });

    const flat = resolveImportPlacement({
      notionId: "subnota",
      parents,
      roles,
      idMap,
      fallbackNotebookId: "nb_destino",
      preserveHierarchy: false,
    });
    assert.deepEqual(flat, { notebookId: "nb_destino", parentPageId: null });

    assert.equal(
      shouldImportAsNotebook({ childCount: 2, notionBlocks: [{ type: "child_page" }] }),
      true
    );
    assert.equal(
      shouldImportAsNotebook({
        childCount: 2,
        notionBlocks: [
          { type: "paragraph", paragraph: { rich_text: [{ plain_text: "um texto qualquer" }] } },
          { type: "image" },
        ],
      }),
      false
    );
    assert.equal(shouldImportAsNotebook({ childCount: 0, notionBlocks: [] }), false);
  });

  await run("markdown notes convert into rich blocks", () => {
    const html = markdownToHtml(
      "# Titulo\n\nTexto com **negrito** e [link](https://exemplo.test).\n\n- um\n- dois\n\n1. passo\n\n- [x] feito\n- [ ] pendente\n\n> citacao\n\n```\ncodigo\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"
    );
    const blocks = htmlToBlocks(parseMarkup(html, { xml: false }));
    const types = blocks.map((block) => block.type);

    assert.ok(types.includes("heading_1"));
    assert.ok(types.includes("bulleted_list_item"));
    assert.ok(types.includes("numbered_list_item"));
    assert.ok(types.includes("todo"));
    assert.ok(types.includes("quote"));
    assert.ok(types.includes("code"));
    assert.ok(types.includes("table"));

    const paragraph = blocks.find((block) => block.type === "paragraph");
    assert.ok(spansPlainText(paragraph?.richText).includes("negrito"));
    assert.ok((paragraph?.richText ?? []).some((span) => span.annotations?.bold));
    assert.ok((paragraph?.richText ?? []).some((span) => span.href));
  });

  await run("plain text notes keep paragraphs and escape markup", () => {
    const html = plainTextToHtml("linha 1\nlinha 2\n\n<b>nao vira tag</b>");
    assert.ok(html.includes("<br />"));
    assert.ok(html.includes("&lt;b&gt;"));
    const blocks = htmlToBlocks(parseMarkup(html, { xml: false }));
    assert.equal(blocks.filter((block) => block.type === "paragraph").length, 2);
  });

  await run("evernote payload helpers tolerate different shapes", () => {
    assert.deepEqual(
      collectRecords({ notebooks: [{ guid: "a", name: "Um" }] }).map((r) => r.guid),
      ["a"]
    );
    assert.deepEqual(
      collectRecords({ data: { results: [{ noteGuid: "n1", title: "T" }] } }).map((r) => r.noteGuid),
      ["n1"]
    );
    assert.deepEqual(collectRecords({ guid: "solo" }).map((r) => r.guid), ["solo"]);
    assert.deepEqual(collectRecords({ total: 0 }), []);

    assert.equal(readString({ notebook_name: "Trabalho" }, ["notebookName"]), "Trabalho");
    assert.equal(readString({ nome: "x" }, ["title"]), null);
    assert.deepEqual(readStringArray({ tags: [{ name: "a" }, "b"] }, ["tags"]), ["a", "b"]);

    assert.equal(readTimestamp({ updated: 1700000000 }, ["updated"]), new Date(1700000000000).toISOString());
    assert.equal(
      readTimestamp({ updated: "2024-03-02T10:00:00.000Z" }, ["updated"]),
      "2024-03-02T10:00:00.000Z"
    );
    assert.equal(readTimestamp({}, ["updated"]), undefined);

    assert.equal(pickArgumentName({ name: "t", inputSchema: { properties: { q: {} } } }, ["query", "q"]), "q");
    assert.equal(
      pickArgumentName({ name: "t", inputSchema: { properties: { notebook_guid: {} } } }, ["notebookGuid"]),
      "notebook_guid"
    );
    assert.equal(pickArgumentName({ name: "t", inputSchema: { properties: {} } }, ["query"]), null);
    assert.equal(pickArgumentName(null, ["query"]), "query");

    assert.equal(detectContentType('<?xml version="1.0"?><en-note><div>a</div></en-note>'), "enml");
    assert.equal(detectContentType("<p>ola</p>"), "html");
    assert.equal(detectContentType("# Titulo\n\ntexto"), "markdown");
    assert.equal(detectContentType("apenas texto simples"), "text");

    assert.equal(extractContent({ note: { content: "<p>x</p>" } }), "<p>x</p>");
    assert.equal(extractContent("direto"), "direto");
    assert.equal(extractContent({ nada: 1 }), "");
  });

  await run("every language ships the integration strings", () => {
    const languages: SupportedLanguage[] = ["pt", "en", "es", "fr", "it", "de", "ru", "ja", "zh", "ar"];
    const keys: TranslationKey[] = [
      "integrations_nav",
      "provider_notion",
      "provider_google_docs",
      "provider_evernote",
      "provider_docx",
      "provider_enex",
      "preserve_structure",
      "preserve_structure_gdoc_desc",
      "preserve_structure_evernote_desc",
      "gdoc_structure_hint",
      "evernote_step_login_title",
      "evernote_step_login_desc",
      "evernote_open_login",
      "evernote_step_authorize_title",
      "evernote_step_authorize_desc",
      "evernote_signin_action",
      "evernote_credentials_notice",
      "evernote_not_connected",
      "evernote_session_expired",
      "evernote_tool_unavailable",
      "evernote_discovery_failed",
      "google_not_connected",
      "google_session_expired",
      "google_access_token_missing",
      "integration_requires_account",
      "oauth_error_access_denied",
      "oauth_error_restricted",
      "oauth_error_generic",
      "oauth_error_state",
      "oauth_error_incomplete",
      "oauth_error_start_from_app",
      "oauth_error_google_not_configured",
    ];

    for (const language of languages) {
      const dict = TRANSLATIONS[language] as Record<TranslationKey, string>;
      for (const key of keys) {
        assert.ok(dict[key] && dict[key].length > 0, `${language}.${key} deve existir`);
      }
      assert.ok(
        !/import/i.test(dict.integrations_nav) && dict.integrations_nav.length <= 20,
        `${language}.integrations_nav deve ser apenas o nome curto`
      );
    }

    assert.equal(TRANSLATIONS.pt.integrations_nav, "Integrações");
    assert.equal(TRANSLATIONS.en.integrations_nav, "Integrations");
  });
}

main().then(
  () => console.log("\nverify:integrations-import ok"),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
