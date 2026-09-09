import { getMentionCandidates } from "../src/components/editor/extensions/mention-suggestion";
import type { Page, Notebook } from "../src/types/models";

function mockNotebook(id: string, name: string, parentId: string | null = null): Notebook {
  return {
    id,
    name,
    parentId,
    order: 0,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function mockPage(id: string, title: string, notebookId: string | null, opts: Partial<Page> = {}): Page {
  return {
    id,
    title,
    notebookId,
    parentPageId: null,
    path: [],
    blocks: [],
    plainText: "",
    extractedOCRText: "",
    transcriptText: "",
    tags: [],
    outgoingLinks: [],
    backlinks: [],
    favorite: false,
    archived: false,
    deletedAt: null,
    createdBy: "user1",
    updatedBy: "user1",
    createdAt: 1000,
    updatedAt: opts.updatedAt ?? 1000,
    order: 0,
    ...opts,
  };
}

const nRoot = mockNotebook("nb_root", "Caderno Raiz", null);
const nParent = mockNotebook("nb_parent", "Caderno Pai", "nb_root");
const nChild = mockNotebook("nb_child", "Caderno Filho", "nb_parent");
const nIsolated = mockNotebook("nb_isolated", "Caderno Isolado", null);

const notebooks = [nRoot, nParent, nChild, nIsolated];

{
  const p1 = mockPage("p1", "Nota 1 do Filho", "nb_child", { updatedAt: 2000 });
  const p2 = mockPage("p2", "Nota 2 do Filho", "nb_child", { updatedAt: 3000 });
  const pParent = mockPage("p_parent", "Nota do Pai", "nb_parent");
  const pRoot = mockPage("p_root", "Nota da Raiz", "nb_root");

  const candidates = getMentionCandidates({
    currentPageId: "p1",
    currentNotebookId: "nb_child",
    livePages: [p1, p2, pParent, pRoot],
    notebooks,
  });

  if (candidates.length !== 1 || candidates[0].id !== "p2") {
    throw new Error(`Teste 1 falhou: esperava apenas p2, obteve ${JSON.stringify(candidates)}`);
  }
  console.log("✓ Teste 1 passou: Mostra apenas notas do mesmo caderno quando há notas");
}

{
  const p1 = mockPage("p1", "Nota Única do Filho", "nb_child");
  const pParent1 = mockPage("p_parent1", "Nota 1 do Pai", "nb_parent", { updatedAt: 4000 });
  const pParent2 = mockPage("p_parent2", "Nota 2 do Pai", "nb_parent", { updatedAt: 5000 });
  const pRoot = mockPage("p_root", "Nota da Raiz", "nb_root");

  const candidates = getMentionCandidates({
    currentPageId: "p1",
    currentNotebookId: "nb_child",
    livePages: [p1, pParent1, pParent2, pRoot],
    notebooks,
  });

  const ids = candidates.map((c) => c.id);
  if (ids.length !== 2 || !ids.includes("p_parent1") || !ids.includes("p_parent2")) {
    throw new Error(`Teste 2 falhou: esperava notas do pai, obteve ${JSON.stringify(candidates)}`);
  }
  console.log("✓ Teste 2 passou: Puxa notas do caderno pai se o caderno atual não tiver notas");
}

{
  const p1 = mockPage("p1", "Nota Única do Filho", "nb_child");
  const pRoot = mockPage("p_root", "Nota da Raiz", "nb_root");

  const candidates = getMentionCandidates({
    currentPageId: "p1",
    currentNotebookId: "nb_child",
    livePages: [p1, pRoot],
    notebooks,
  });

  if (candidates.length !== 1 || candidates[0].id !== "p_root") {
    throw new Error(`Teste 3 falhou: esperava nota da raiz, obteve ${JSON.stringify(candidates)}`);
  }
  console.log("✓ Teste 3 passou: Sobe para o avô quando o pai também estiver vazio");
}

{
  const pIso = mockPage("p_iso", "Nota Isolada", "nb_isolated");

  const candidates = getMentionCandidates({
    currentPageId: "p_iso",
    currentNotebookId: "nb_isolated",
    livePages: [pIso],
    notebooks,
  });

  if (candidates.length !== 0) {
    throw new Error(`Teste 4 falhou: esperava lista vazia, obteve ${JSON.stringify(candidates)}`);
  }
  console.log("✓ Teste 4 passou: Retorna vazio quando caderno não tem outras notas e não tem pai");
}

{
  const pNoNb = mockPage("p_none", "Sem Caderno", null);
  const pRoot = mockPage("p_root", "Nota da Raiz", "nb_root");

  const candidates = getMentionCandidates({
    currentPageId: "p_none",
    currentNotebookId: null,
    livePages: [pNoNb, pRoot],
    notebooks,
  });

  if (candidates.length !== 0) {
    throw new Error(`Teste 5 falhou: esperava vazio para página sem caderno, obteve ${JSON.stringify(candidates)}`);
  }
  console.log("✓ Teste 5 passou: Retorna vazio para páginas sem caderno");
}

{
  const p1 = mockPage("p1", "Nota Atual", "nb_child");
  const pArchived = mockPage("p_archived", "Nota Arquivada", "nb_child", { archived: true });
  const pDeleted = mockPage("p_deleted", "Nota Deletada", "nb_child", { deletedAt: 99999 });
  const pParent = mockPage("p_parent", "Nota Pai", "nb_parent");

  const candidates = getMentionCandidates({
    currentPageId: "p1",
    currentNotebookId: "nb_child",
    livePages: [p1, pArchived, pDeleted, pParent],
    notebooks,
  });

  if (candidates.length !== 1 || candidates[0].id !== "p_parent") {
    throw new Error(`Teste 6 falhou: esperava p_parent, obteve ${JSON.stringify(candidates)}`);
  }
  console.log("✓ Teste 6 passou: Desconsidera páginas arquivadas ou deletadas e busca do pai");
}

console.log("\nTodos os testes de escopo de menção @ passaram com sucesso!");
