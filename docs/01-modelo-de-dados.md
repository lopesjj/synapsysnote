# ETAPA 1 — Modelagem NoSQL e regras de segurança

Arquivos: [`firestore.rules`](../firestore.rules) ·
[`storage.rules`](../storage.rules) ·
[`firestore.indexes.json`](../firestore.indexes.json) ·
[`src/types/models.ts`](../src/types/models.ts)

## 1. Estrutura de coleções

```
/users/{userId}
    uid, email, displayName, phone, photoURL, providers[]
    registrationCompleted
    preferences { theme, sidebarCollapsed, sidebarWidth, notesLayout,
                  notesSort, notesSortDirection, notesDensity,
                  editorFontId, editorFontSize, editorWidth,
                  showSaveIndicator }
    createdAt, updatedAt, lastSeenAt

/workspaces/{workspaceId}
    name, emoji, ownerId, memberIds[], plan, createdAt, updatedAt

  /members/{userId}
      userId, email, displayName, photoURL, role, joinedAt
      role ∈ owner | admin | editor | viewer

  /notebooks/{notebookId}
      name, emoji, color, description, coverUrl
      parentId                                   ← nulo = página (raiz); preenchido = caderno
      order, createdAt, updatedAt

  /pages/{pageId}                                ← notas
      title, icon, coverUrl
      notebookId, parentPageId, path[]          ← hierarquia
      blocks[]                                   ← AppBlock[] aninhado
      plainText, extractedOCRText, transcriptText
      tags[], outgoingLinks[], backlinks[]
      embedding (vector<768>), embeddingUpdatedAt
      favorite, archived, deletedAt
      notionPageId, notionUrl, importJobId       ← proveniência (só Admin SDK)
      importSource                               ← "notion-zip" (import no cliente)
      createdBy, updatedBy, createdAt, updatedAt, order

    /versions/{versionId}
        pageId, title, blocks[], authorId, label, createdAt   (imutável)

  /databases/{databaseId}
      name, icon, description, notebookId, parentPageId
      properties[]      PropertyDef
      views[]           DatabaseView (table | kanban | gallery | calendar)
      notionDatabaseId, deletedAt, createdAt, updatedAt

    /rows/{rowId}
        values{ propertyId → valor }, pageId, order,
        notionPageId, createdAt, updatedAt

  /attachments/{attachmentId}
      pageId, storagePath, url, name, mimeType, sizeBytes,
      ocrText, transcript, uploadedBy, createdAt

  /import_jobs/{jobId}
      status, currentStep,
      totalPages, processedPages, totalFiles, processedFiles, totalBytes,
      errors[], items[], selection, targetNotebookId, options,
      requestedBy, startedAt, finishedAt, createdAt, updatedAt

    /logs/{logId}        (somente Admin SDK)

  /integrations/{integrationId}
      provider, connected, workspaceName, notionWorkspaceId, botId,
      tokenPreview, scopes, connectedBy, connectedAt, lastSyncAt, revokedAt

    /secure/{secretId}   accessTokenCipher   ← negado a todo cliente
```

## 2. Decisões de modelagem

**Blocos embutidos na página, não em subcoleção.** Uma página é sempre lida
inteira; embutir `blocks[]` transforma a abertura em **uma** leitura e permite
edição transacional do documento. O limite de 1 MiB por documento acomoda
páginas muito longas porque binários nunca entram no Firestore — só a URL do
Storage. Notas que passariam do limite indicam que deveriam ser subnotas.

**Página, caderno e nota.** `notebooks/{id}` cobre dois papéis na UI: raiz
(`parentId` nulo ou ausente) é **página**; filho é **caderno**. Documentos em
`pages/{id}` são **notas**. `parentId` ausente em cadernos antigos é tratado
como raiz — o campo entrou depois dos primeiros workspaces. Duplicar uma
página/caderno copia a subárvore de cadernos e as notas de cada um
([`duplicate.ts`](../src/lib/data/duplicate.ts)).

**`path[]` materializado.** Guardar a cadeia de ancestrais da *nota* permite
carregar uma subárvore inteira com `where('path', 'array-contains', pageId)`,
sem recursão de leituras. O custo é reescrever `path` ao mover — operação rara.
Cadernos não materializam `path`: a cadeia cabe em memória
([`notebook-tree.ts`](../src/lib/data/notebook-tree.ts)).

**`backlinks[]` desnormalizado.** Backlinks bidirecionais precisam ser instantâneos
na renderização. `outgoingLinks` é derivado das menções ao salvar; `backlinks` é o
inverso, mantido pelo mesmo caminho de escrita (e pelo worker, ao final de uma
importação).

**`memberIds[]` no workspace.** Duplicado em relação à subcoleção `members`, mas
é o que viabiliza `where('memberIds','array-contains',uid)` para listar os
workspaces de um usuário. A subcoleção continua sendo a fonte de autorização,
porque carrega o papel e pode ser revogada individualmente.

**Campos server-only.** `extractedOCRText`, `transcriptText` e `embedding` são
escritos apenas pelo Admin SDK. As regras usam `unchanged(field)` para rejeitar
qualquer tentativa do cliente — sem isso, o índice de busca seria falsificável.

**Props de bloco que o editor persiste.** Além do tipo e do rich text,
`AppBlock.props` guarda `textAlign`, `indentFirst` (recuo de primeira linha),
`language` / `autoDetect` (código) e `color`. Anotações de span incluem
`highlight` (marca-texto). `media.displayWidth` é a largura visível da imagem
(20–100% da coluna). Tabelas usam `tableRows` como objetos — o Firestore
rejeita arrays aninhados.

## 3. Regras do Firestore

Primitiva única de autorização: existir em
`/workspaces/{id}/members/{uid}`. Todo o resto deriva daí.

```
isMember(ws)  → exists(members/$(uid))
canWrite(ws)  → role ∈ [owner, admin, editor]
isAdmin(ws)   → role ∈ [owner, admin]
```

Pontos não óbvios das regras:

- **Bootstrap do workspace.** Quem cria precisa se declarar `ownerId` e ser o
  único item de `memberIds`; a criação do próprio documento de membro exige que o
  workspace já aponte para ele como dono. Isso fecha o ciclo sem precisar de uma
  Cloud Function no cadastro.
- **Exclusão de página é soft delete.** `delete` direto exige papel de admin; o
  fluxo normal grava `deletedAt`. É o que garante a lixeira de 30 dias.
- **Jobs de importação.** `create` é negado ao cliente — o job nasce no Admin SDK
  (rota Next / Cloud Function). A única transição que o cliente pode aplicar é
  `canceled` (e só enquanto o status ainda é `pending` / `discovering` /
  `running`). Todo o progresso pertence ao worker — nenhuma UI consegue fabricar
  "100% concluído".
- **Páginas antigas de `.zip`.** Importações feitas no navegador (recurso
  removido) ficam com `importSource: "notion-zip"` e `notionPageId` /
  `importJobId` nulos. As regras ainda recusam o cliente preencher os campos de
  proveniência do pipeline OAuth.
- **Integrações.** `allow write: if false` no documento e negação total na
  subcoleção `secure`. O status de conexão é legível (para renderizar a tela),
  o token não existe do lado do cliente.
- **Versões são imutáveis.** `allow update: if false`; histórico que pode ser
  reescrito não é histórico.

## 4. Regras do Storage

Mesma primitiva de membro, lida via `firestore.get()`. Além disso:

| Prefixo | Escrita | Limite | Tipos |
| --- | --- | --- | --- |
| `workspaces/{ws}/uploads/{pageId}/` | membro editor | 50 MB | imagens, vídeo, áudio, texto, PDF, Office, zip (inclui `uploads/zip-import/` e `uploads/icons/`) |
| `workspaces/{ws}/audio/{pageId}/` | membro editor | 200 MB | `audio/*` |
| `workspaces/{ws}/notion/{jobId}/` | **negada** (só Admin SDK) | — | qualquer (rehospedagem) |
| `workspaces/{ws}/exports/` | **negada** | — | gerado por função |
| `users/{uid}/` | o próprio usuário | 5 MB | `image/*` |

## 5. Índices

Compostos para os acessos quentes (`notebookId + deletedAt + order`,
`parentPageId + order`, `tags array-contains + updatedAt`, `notionPageId`,
`status + createdAt` em jobs) e um **índice vetorial de 768 dimensões** em
`pages.embedding`, usado por `findNearest` na busca semântica.

`fieldOverrides` desliga a indexação de `blocks`, `plainText` e
`extractedOCRText`: são campos grandes que nunca aparecem em `where`, e indexá-los
custaria escrita e armazenamento sem retorno.
