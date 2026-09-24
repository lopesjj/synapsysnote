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
    legalAcceptedVersion, legalAcceptedAt       ← só o servidor grava
    preferences { theme, language, sidebar…, notes…, editor…,
                  acessibilidade…, flashcardSettings }
    createdAt, updatedAt, lastSeenAt

/export_locks/{uid}                             ← só Admin SDK: uma exportação por vez
    until

/access_logs/{logId}                            ← só Admin SDK
    uid, email, ip, userAgent, event, createdAt
    expiresAt                                   ← TTL: apagado após 190 dias

/workspaces/{workspaceId}                       ← hoje sempre ws_{uid}
    name, emoji, language, ownerId, memberIds[], plan, createdAt, updatedAt

  /members/{userId}
      userId, email, displayName, photoURL, role, joinedAt
      role ∈ owner | admin | editor | viewer

  /notebooks/{notebookId}
      name, emoji, color, description, coverUrl, coverPosition
      parentId                                   ← nulo = página (raiz); preenchido = caderno
      notionPageId                               ← proveniência (só Admin SDK)
      deletedAt, trashedWith                     ← lixeira
      order, createdAt, updatedAt

  /pages/{pageId}                                ← notas
      title, icon, coverUrl, coverPosition
      notebookId, parentPageId, path[]          ← hierarquia
      blocksJson                                 ← AppBlock[] serializado (string)
      plainText, extractedOCRText, transcriptText
      tags[], outgoingLinks[]
      favorite, archived, deletedAt, trashedWith
      lastWriteId                                ← id da última gravação do editor
      notionPageId, notionUrl, importJobId       ← proveniência (só Admin SDK)
      retiredNotionId                            ← item substituído numa reimportação (vai para a lixeira)
      importSource                               ← evernote | docx | google-docs | html | notion-zip
      createdBy, updatedBy, createdAt, updatedAt, order

    /versions/{versionId}
        pageId, title, blocksJson, authorId, label, createdAt
        (imutável; removida após 30 dias)

  /databases/{databaseId}
      name, icon, description, notebookId, parentPageId
      properties[]      PropertyDef
      views[]           DatabaseView (table | kanban | gallery | calendar)
      notionDatabaseId, deletedAt, trashedWith, createdAt, updatedAt

    /rows/{rowId}
        values{ propertyId → valor }, pageId, order,
        notionPageId, createdAt, updatedAt

  /flashcards/{flashcardId}
      pageId, notebookId, pageTitle, front, back, hint
      frontImageUrl, frontImageStoragePath, backImageUrl, backImageStoragePath
      repetition, interval, easeFactor, nextReviewDate, lastReviewedAt   ← SM-2
      createdBy, createdAt, updatedAt

  /trashed_media/{base64url(storagePath)}       ← quarentena de arquivos (só Admin SDK)
      storagePath, pageId, userId, markedForDeletionAt, expiresAt

  /import_jobs/{jobId}
      provider, status, currentStep,
      totalPages, processedPages, totalFiles, processedFiles, totalBytes,
      errors[], items[], selection, targetNotebookId, options,
      leaseOwner, leaseUntil                     ← só um executor por vez
      requestedBy, startedAt, finishedAt, createdAt, updatedAt

    /meta/tree           parents, orderedNodes, roles   (só Admin SDK)
    /logs/{logId}        (somente Admin SDK)

  /integrations/{integrationId}
      provider, connected, workspaceName, notionWorkspaceId, botId,
      tokenPreview, scopes, connectedBy, connectedAt, lastSyncAt, revokedAt

    /secure/{secretId}   accessTokenCipher / refreshTokenCipher   ← negado a todo cliente

  /attachments/{attachmentId}                    ← legado: não é mais gravado;
                                                   removido pela migração 2026-09
```

## 2. Decisões de modelagem

**Blocos embutidos na página, serializados em `blocksJson`.** Uma página é
sempre lida inteira; guardar os blocos no próprio documento transforma a
abertura em **uma** leitura e permite gravar com transação. Os blocos vão como
texto JSON e não como array nativo: o Firestore recusa arrays aninhados (tabelas),
limita a profundidade de mapas e indexaria cada campo de cada bloco. O
adaptador recusa gravar uma nota acima de ~900 KB (o limite do documento é
1 MiB); binários nunca entram no Firestore, só a URL do Storage. O campo
`blocks` nativo das versões antigas é lido como fallback e removido pela
migração ([`docs/10`](10-deploy-e-migracao.md)).

**Concorrência na mesma nota.** O editor envia, junto do conteúdo, a base da
edição (o último conteúdo que ele viu do banco). Se o documento mudou nesse
meio-tempo (outra aba ou outro dispositivo), a gravação roda em transação e faz
uma mescla de três vias por bloco
([`block-merge.ts`](../src/lib/data/block-merge.ts)): o que só um lado mudou é
mantido; quando os dois inserem blocos diferentes no mesmo ponto, os dois ficam e
o usuário é avisado. `lastWriteId` permite ao editor reconhecer o eco da
própria gravação.

**Página, caderno e nota.** `notebooks/{id}` cobre dois papéis na UI: raiz
(`parentId` nulo ou ausente) é **página**; filho é **caderno**. Documentos em
`pages/{id}` são **notas**. Duplicar uma página/caderno copia a subárvore de
cadernos, as notas, os flashcards e os arquivos
([`duplicate.ts`](../src/lib/data/duplicate.ts)).

**`path[]` materializado.** Guardar a cadeia de ancestrais da *nota* permite
carregar uma subárvore inteira com `where('path', 'array-contains', pageId)`,
sem recursão de leituras. O custo é reescrever `path` ao mover — operação rara.
Cadernos não materializam `path`: a cadeia cabe em memória
([`notebook-tree.ts`](../src/lib/data/notebook-tree.ts)).

**Lixeira.** Excluir grava `deletedAt`. Um caderno leva junto o que estava ativo
dentro dele, marcado com `trashedWith: <id do caderno>`; restaurar o caderno
traz exatamente esses itens. Depois de 30 dias a Cloud Function
`purgeExpiredTrash` apaga documentos, subcoleções, flashcards e os arquivos que
nenhum outro documento usa.

**Backlinks.** `outgoingLinks` é derivado das menções ao salvar; a seção de
backlinks de uma nota é calculada na leitura (quem tem o id dela em
`outgoingLinks`). O campo `backlinks[]` de documentos antigos não é mais usado.

**`memberIds[]` no workspace.** Duplicado em relação à subcoleção `members`, mas
é o que viabiliza `where('memberIds','array-contains',uid)` para listar os
workspaces de um usuário. A subcoleção continua sendo a fonte de autorização,
porque carrega o papel e pode ser revogada individualmente.

**Campos server-only.** `extractedOCRText`, `transcriptText`, a proveniência do
Notion e o aceite dos documentos legais são escritos apenas pelo Admin SDK. As
regras usam `unchanged(field)` / `affectedKeys()` para rejeitar qualquer
tentativa do cliente.

**Props de bloco que o editor persiste.** Além do tipo e do rich text,
`AppBlock.props` guarda `textAlign`, `indentFirst` (recuo de primeira linha),
`language` / `autoDetect` (código) e `color`. Anotações de span incluem
`highlight` (marca-texto). `media.displayWidth` é a largura visível da imagem
(20–100% da coluna). Tabelas usam `tableRows` como objetos.

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
  único item de `memberIds`, e só no id `ws_{uid}`; a criação do próprio
  documento de membro exige que o workspace já aponte para ele como dono.
- **Papéis.** Admin convida e altera papéis, mas não concede nem retira o papel
  de dono (só o dono concede) e não altera o próprio papel.
- **Aceite legal.** O cliente não cria nem altera `legalAcceptedVersion` /
  `legalAcceptedAt`; o registro passa por `/api/legal/accept`.
- **Exclusão de página é soft delete.** `delete` direto exige papel de admin; o
  fluxo normal grava `deletedAt`. É o que garante a lixeira de 30 dias.
- **Jobs de importação.** `create` é negado ao cliente — o job nasce no Admin SDK.
  A única transição que o cliente pode aplicar é `canceled` (e só enquanto o
  status ainda é `pending` / `discovering` / `running`).
- **Integrações e quarentena.** `allow write: if false`; o token não existe do
  lado do cliente e a quarentena só muda pelas rotas do servidor.
- **Versões são imutáveis.** `allow update: if false`; histórico que pode ser
  reescrito não é histórico.

## 4. Regras do Storage

Mesma primitiva de membro, lida via `firestore.get()`. Além disso:

| Prefixo | Escrita | Limite | Tipos |
| --- | --- | --- | --- |
| `workspaces/{ws}/uploads/icons/` | membro editor | 10 MB | `image/*` |
| `workspaces/{ws}/uploads/{pageId}/` | membro editor | 50 MB (vídeo 150 MB) | imagens, vídeo, áudio, texto, PDF, Office, zip |
| `workspaces/{ws}/audio/{pageId}/` | membro editor | 200 MB | `audio/*`, `video/webm` |
| `workspaces/{ws}/notion/{jobId}/` | **negada** (só Admin SDK) | — | rehospedagem do Notion |
| `workspaces/{ws}/exports/` | **negada** | — | gerado no servidor |
| `users/{uid}/` | o próprio usuário | 5 MB | `image/*` (avatar) |
| `exports/{uid}/` | **negada** (só a função de exportação) | — | `.zip` da cópia dos dados; só o dono lê; apagado em 2 dias |

Arquivo removido de uma nota vai para a quarentena (`trashed_media`) e só é
apagado 30 dias depois, se nenhuma nota, versão, base, caderno ou flashcard o
estiver usando.

## 5. Índices

Nenhum índice composto: as consultas do app usam um único campo. Os
`fieldOverrides` fazem duas coisas:

- desligam a indexação de campos grandes que nunca aparecem em `where`
  (`blocks`, `blocksJson`, `plainText`, `extractedOCRText` das notas e versões;
  `items`, `treeMetadata` e `errors` dos jobs);
- criam índices de **grupo de coleções** para a limpeza agendada: `deletedAt` em
  `pages`, `notebooks` e `databases`, `expiresAt` em `trashed_media` e
  `createdAt` em `versions`.

`access_logs.expiresAt` tem **TTL** ativado: o Firestore apaga o registro
sozinho quando a data passa.
