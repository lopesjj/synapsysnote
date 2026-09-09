import assert from "node:assert/strict";
import { searchWorkspace } from "../src/lib/search";
import type { Page, Notebook } from "../src/types/models";

function mockNotebook(id: string, name: string, description?: string): Notebook {
  return {
    id,
    name,
    description,
    parentId: null,
    order: 0,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function mockPage(id: string, title: string, plainText: string, opts: Partial<Page> = {}): Page {
  return {
    id,
    title,
    notebookId: "nb_1",
    parentPageId: null,
    path: [],
    blocks: [],
    plainText,
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

const notebooks: Notebook[] = [
  mockNotebook("nb_fin", "Finanças Pessoais", "Planejamento orçamentário mensal"),
  mockNotebook("nb_proj", "Projetos de Software", "Documentações de código"),
];

const pages: Page[] = [
  mockPage("p_inv", "Investimentos 2026", "Ações, fundos imobiliários e renda fixa"),
  mockPage("p_api", "Documentação da API", "Endpoints REST e autenticação com Firebase"),
  mockPage("p_del", "Página Excluída", "Texto antigo", { deletedAt: 5000 }),
];

// 1. Busca por termo que só existe no nome do caderno
{
  const hits = searchWorkspace("Finanças", pages, notebooks);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "notebook");
  assert.equal(hits[0].id, "nb_fin");
  console.log("✓ Teste 1 passou: Encontra cadernos por nome");
}

// 2. Busca por termo que só existe no título da página
{
  const hits = searchWorkspace("Investimentos", pages, notebooks);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "page");
  assert.equal(hits[0].id, "p_inv");
  console.log("✓ Teste 2 passou: Encontra páginas por título");
}

// 3. Busca por termo no conteúdo (plainText) da página
{
  const hits = searchWorkspace("imobiliários", pages, notebooks);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "page");
  assert.equal(hits[0].id, "p_inv");
  console.log("✓ Teste 3 passou: Encontra páginas pelo conteúdo textual");
}

// 4. Busca por termo comum a ambos (caderno e página)
{
  const hits = searchWorkspace("código", pages, notebooks);
  assert.ok(hits.some((h) => h.kind === "notebook" && h.id === "nb_proj"));
  console.log("✓ Teste 4 passou: Busca integrada de cadernos e páginas");
}

// 5. Ignora páginas excluídas
{
  const hits = searchWorkspace("Excluída", pages, notebooks);
  assert.equal(hits.length, 0);
  console.log("✓ Teste 5 passou: Ignora páginas excluídas");
}

// 6. Query vazia
{
  const hits = searchWorkspace("", pages, notebooks);
  assert.equal(hits.length, 0);
  console.log("✓ Teste 6 passou: Retorna vazio para query vazia");
}

console.log("\nTodos os testes de pesquisa em cadernos e páginas passaram com sucesso!");
