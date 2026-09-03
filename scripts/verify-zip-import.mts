/**
 * Sanity check for the client-side Notion `.zip` importer.
 *
 * Builds a synthetic export that exercises the structures the real thing emits
 * — nested page folders, a database CSV plus its row pages, media, callouts,
 * toggles, tables, task lists and relative cross-page links — then asserts the
 * plan the importer derives from it.
 *
 * Run with: npx tsx scripts/verify-zip-import.mts
 */

import assert from "node:assert/strict";
import JSZip from "jszip";
import { buildImportPlan } from "../src/lib/notion/zip/run-import";
import { parseNotionMarkdown } from "../src/lib/notion/zip/markdown";
import { parseCsv } from "../src/lib/notion/zip/csv";

const PROJECT_ID = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
const MEETING_ID = "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e";
const TASKS_ID = "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f";
const ROW_ID = "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90";

function buildZip(): Promise<Buffer> {
  const zip = new JSZip();
  const root = `Export-abcdef12-3456-7890-abcd-ef1234567890`;

  zip.file(
    `${root}/Trabalho/Projetos ${PROJECT_ID}.md`,
    [
      `# Projetos`,
      ``,
      `Um parágrafo com **negrito**, *itálico*, ~~riscado~~ e \`código\`.`,
      ``,
      `## Metas`,
      ``,
      `- [x] Definir escopo`,
      `- [ ] Escrever proposta`,
      `    - Subitem aninhado`,
      ``,
      `1. Primeiro`,
      `2. Segundo`,
      ``,
      `> Uma citação relevante.`,
      ``,
      `<aside>`,
      `💡 Callout com um [link externo](https://example.com).`,
      `</aside>`,
      ``,
      `<details><summary>Detalhes ocultos</summary>`,
      ``,
      `Conteúdo do toggle.`,
      ``,
      `</details>`,
      ``,
      "```ts",
      `const answer: number = 42;`,
      "```",
      ``,
      `$$`,
      `E = mc^2`,
      `$$`,
      ``,
      `| Coluna A | Coluna B |`,
      `| --- | --- |`,
      `| 1 | 2 |`,
      ``,
      `---`,
      ``,
      `![diagrama](Projetos%20${PROJECT_ID}/diagrama.png)`,
      ``,
      `Veja a [Reunião](Projetos%20${PROJECT_ID}/Reuniao%20${MEETING_ID}.md).`,
    ].join("\n")
  );

  zip.file(
    `${root}/Trabalho/Projetos ${PROJECT_ID}/Reuniao ${MEETING_ID}.md`,
    [`# Reunião de kickoff`, ``, `Notas da reunião.`].join("\n")
  );

  // 1x1 transparent PNG.
  zip.file(
    `${root}/Trabalho/Projetos ${PROJECT_ID}/diagrama.png`,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAB/wD/gQ0AAAAASUVORK5CYII=",
      "base64"
    )
  );

  zip.file(
    `${root}/Trabalho/Tarefas ${TASKS_ID}.csv`,
    ['Nome,Status,Prioridade\n"Escrever proposta",Fazendo,Alta\n"Revisar, com vírgula",A fazer,Baixa\n'].join("")
  );

  zip.file(
    `${root}/Trabalho/Tarefas ${TASKS_ID}/Escrever proposta ${ROW_ID}.md`,
    [`# Escrever proposta`, ``, `Detalhes da tarefa.`].join("\n")
  );

  // Notion also emits an `_all.csv` duplicate, which must be ignored.
  zip.file(`${root}/Trabalho/Tarefas ${TASKS_ID}_all.csv`, "Nome,Status\n");

  zip.file(`${root}/Pessoal/Diário ${"5e6f7a8b9c0d1e2f3a4b5c6d7e8f9012"}.md`, "# Diário\n\nTexto.");

  return zip.generateAsync({ type: "nodebuffer" });
}

function checkMarkdown() {
  const parsed = parseNotionMarkdown(
    ["# Título", "", "Texto **forte**.", "", "- [x] feito", "- [ ] pendente"].join("\n")
  );

  assert.equal(parsed.title, "Título", "leading H1 becomes the title");
  const types = parsed.blocks.map((block) => block.type);
  assert.deepEqual(types, ["paragraph", "todo", "todo"], `unexpected blocks: ${types.join()}`);
  assert.equal(parsed.blocks[1].props?.checked, true, "checked task");
  assert.equal(parsed.blocks[2].props?.checked, false, "unchecked task");

  const spans = parsed.blocks[0].richText ?? [];
  assert.ok(
    spans.some((span) => span.annotations?.bold && span.text === "forte"),
    "bold span preserved"
  );
  console.log("  markdown: title, tasks and inline marks OK");
}

function checkCsv() {
  const grid = parseCsv('a,b\n"x,y",z\n"quoted ""inner""",w\n');
  assert.deepEqual(grid, [
    ["a", "b"],
    ["x,y", "z"],
    ['quoted "inner"', "w"],
  ]);
  console.log("  csv: quoting, embedded commas and escaped quotes OK");
}

async function checkPlan() {
  const buffer = await buildZip();
  // `buildImportPlan` takes a File; Node 20+ has one backed by Blob.
  const file = new File([new Uint8Array(buffer)], "Export.zip", { type: "application/zip" });
  const plan = await buildImportPlan(file);

  const notebookNames = plan.notebooks.map((notebook) => notebook.name).sort();
  assert.deepEqual(
    notebookNames,
    ["Pessoal", "Trabalho"],
    `top-level folders become notebooks, got ${notebookNames.join()}`
  );

  const titles = plan.pages.map((page) => page.title).sort();
  assert.deepEqual(
    titles,
    ["Diário", "Escrever proposta", "Projetos", "Reunião de kickoff", "Tarefas"],
    `unexpected pages: ${titles.join(" | ")}`
  );

  const projects = plan.pages.find((page) => page.title === "Projetos")!;
  const meeting = plan.pages.find((page) => page.title === "Reunião de kickoff")!;
  const tasks = plan.pages.find((page) => page.title === "Tarefas")!;
  const row = plan.pages.find((page) => page.title === "Escrever proposta")!;

  assert.equal(projects.parentKey, null, "a root page has no parent");
  assert.equal(projects.notebookKey, "nb:Trabalho", "root page lands in its folder's notebook");
  assert.equal(meeting.parentKey, projects.key, "the mirrored folder nests the child page");
  assert.equal(meeting.notebookKey, null, "children inherit the notebook via the parent");
  assert.equal(row.parentKey, tasks.key, "database rows nest under the database page");

  // The `_all.csv` duplicate must not have produced a second database.
  assert.equal(
    plan.pages.filter((page) => page.icon === "🗂️").length,
    1,
    "the _all.csv duplicate is ignored"
  );

  const table = tasks.blocks.find((block) => block.type === "table");
  assert.ok(table?.props?.tableRows?.length === 3, "CSV became a 3-row table");
  assert.equal(
    table?.props?.tableRows?.[2]?.[0]?.[0]?.text,
    "Revisar, com vírgula",
    "quoted comma survived the CSV parse"
  );

  const kinds = projects.blocks.map((block) => block.type);
  for (const expected of [
    "heading_2",
    "todo",
    "numbered_list_item",
    "quote",
    "callout",
    "toggle",
    "code",
    "equation",
    "table",
    "divider",
    "image",
  ]) {
    assert.ok(kinds.includes(expected as never), `missing ${expected} block (got ${kinds.join()})`);
  }

  assert.equal(plan.summary.mediaCount, 1, "only the referenced image is queued for upload");
  assert.ok(
    plan.pendingLinks.get(projects.key)?.some((href) => href.includes(MEETING_ID)),
    "the relative cross-page link is captured for rewriting"
  );
  assert.ok(plan.pageByNotionId.has(MEETING_ID), "pages are indexed by their Notion id");

  console.log(
    `  plan: ${plan.notebooks.length} notebooks, ${plan.pages.length} pages, ` +
      `${plan.summary.mediaCount} media, hierarchy and links OK`
  );
}

async function main() {
  console.log("verifying the Notion .zip importer");
  checkMarkdown();
  checkCsv();
  await checkPlan();
  console.log("all checks passed");
}

await main();
