# ETAPA 3 — Pipeline de importação do Notion

Arquivos:
[`api/notion/authorize`](../src/app/api/notion/authorize/route.ts) ·
[`api/notion/callback`](../src/app/api/notion/callback/route.ts) ·
[`functions/src/notion/`](../functions/src/notion/)

## 1. OAuth 2.0

```
Usuário clica "Conectar"
   → GET /api/notion/authorize?workspaceId=…
        gera nonce, grava cookie httpOnly, monta state = base64({nonce, workspaceId})
        302 → https://api.notion.com/v1/oauth/authorize
   → usuário escolhe no Notion QUAIS páginas compartilhar
   → GET /api/notion/callback?code=…&state=…
        valida nonce (CSRF)
        POST /v1/oauth/token  (Basic client_id:client_secret)
        criptografa access_token com AES-256-GCM
        grava:
          /workspaces/{id}/integrations/notion          ← metadados legíveis
          /workspaces/{id}/integrations/notion/secure/token ← ciphertext
   → 302 /app/integrations?connected=notion
```

O envelope de criptografia é versionado (`v1.<iv>.<tag>.<ciphertext>`) para
permitir rotação de chave sem adivinhar o formato — mesma implementação nos dois
runtimes ([`token-cipher.ts`](../src/lib/crypto/token-cipher.ts) e
[`functions/src/lib/crypto.ts`](../functions/src/lib/crypto.ts)).

Reconexão é apenas repetir o fluxo (grava por cima). Revogação
(`disconnectNotion`) marca `connected: false`, grava `revokedAt` e **apaga** o
documento do token.

## 2. Leitura da árvore

[`tree.ts`](../functions/src/notion/tree.ts) — `POST /v1/search` devolve uma
lista plana com ponteiro `parent`; a hierarquia é remontada localmente. Itens
cujo pai não foi compartilhado com a integração viram raízes em vez de sumirem —
o usuário compartilhou aquela página, então ela precisa aparecer no wizard.

Toda chamada passa por `throttled()` ([`client.ts`](../functions/src/notion/client.ts)),
que respeita o limite de ~3 req/s da API e faz retry exponencial com jitter em
429/409/5xx.

## 3. Conversor recursivo

[`block-converter.ts`](../functions/src/notion/block-converter.ts) —
`notionBlockToAppBlock(block, ctx, depth)`.

Mapeamento:

| Notion | App |
| --- | --- |
| `paragraph`, `heading_1..3`, `quote`, `divider` | equivalentes diretos |
| `bulleted_list_item`, `numbered_list_item` | listas (agrupadas na serialização do editor) |
| `to_do` | `todo` com `props.checked` |
| `toggle` | `toggle` com filhos aninhados |
| `callout` | `callout` preservando o emoji do ícone |
| `code` | `code` com `props.language` |
| `equation` | `equation` (LaTeX → KaTeX) |
| `image`, `video`, `audio`, `file`, `pdf` | bloco de mídia **após rehospedagem** |
| `bookmark`, `embed`, `link_preview` | `bookmark` com URL e título |
| `table` + `table_row` | `table` com `props.tableRows` |
| `child_page`, `child_database` | referência resolvida para o id local |
| `column_list`, `column`, `synced_block` | achatados (os filhos sobem um nível) |
| `table_of_contents`, `breadcrumb` | descartados |
| desconhecido | `unsupported` com aviso legível — nada é perdido em silêncio |

O rich text preserva negrito, itálico, sublinhado, tachado, código, cor e link.
Menções de página viram `mention` apontando para o **id local** quando a página
já foi importada (via `resolvePageLink`), o que reconstrói os links internos.

Proteções: profundidade máxima de 12 níveis (blocos sincronizados podem formar
ciclos) e paginação completa de `blocks.children.list`.

## 4. Bases de dados

[`property-mapper.ts`](../functions/src/notion/property-mapper.ts)

| Notion | App |
| --- | --- |
| `title` | `title` |
| `rich_text` | `text` |
| `number` | `number` |
| `select`, `status` | `select` (opções e cores convertidas) |
| `multi_select` | `multi_select` |
| `date` | `date` |
| `checkbox` | `checkbox` |
| `url`, `email`, `phone_number` | `url`, `email`, `phone` |
| `people` | `person` |
| `files` | `files` — **URLs rehospedadas** |
| `relation` | `relation` (ids preservados) |
| `formula`, `rollup` | achatados para texto/número (sem equivalente local) |
| `created_time`, `last_edited_time` | somente leitura |

Toda base importada nasce com duas visualizações: Tabela e Kanban (agrupado pela
primeira propriedade de seleção encontrada). As linhas são gravadas em lotes de
até 400 escritas, abaixo do teto de 500 do Firestore.

## 5. Pipeline de mídia — o ponto crítico

[`media-pipeline.ts`](../functions/src/notion/media-pipeline.ts)

A API do Notion entrega arquivos como **URLs presigned do S3 que expiram em ~1
hora**. Persistir esses links produz uma base inteira de imagens quebradas no dia
seguinte. Por isso, para cada arquivo:

1. `fetch(url)` com `redirect: follow`;
2. `pipeline(response.body → contador → file.createWriteStream())` — streaming
   puro, memória constante mesmo em vídeos grandes;
3. metadados com `firebaseStorageDownloadTokens` (URL permanente sem expiração)
   e `cacheControl: immutable`;
4. o bloco é reescrito com `url`, `storagePath`, `mimeType` e `sizeBytes`;
5. imagens e PDFs saem marcados como `pending: true` — o gatilho de OCR limpa
   essa flag quando o texto chega.

Limite configurável por `IMPORT_MAX_FILE_BYTES` (padrão 250 MB), aplicado tanto
pelo `content-length` quanto durante o stream.

## 6. Worker em background

[`import-job.ts`](../functions/src/notion/import-job.ts)

```
cliente  startNotionImport (callable)
             └─ cria /workspaces/{ws}/import_jobs/{jobId}  status=pending
                                        │
                     onDocumentCreated  ▼   (60 min, 1 GiB)
                     processNotionImportJob
                        status=discovering  → lê a árvore
                        status=running      → para cada item:
                                                converte blocos
                                                rehospeda mídias
                                                grava página/base
                                                atualiza o job
                        reconstrói backlinks
                        status=completed | completed_with_errors | failed
```

Por que o gatilho de documento em vez de HTTP: importar milhares de páginas não
cabe no tempo limite de uma requisição, e o cliente não pode ficar preso.

Detalhes que importam:

- **Progresso a cada item.** `ProgressReporter` usa `FieldValue.increment` nos
  contadores (correto sob concorrência) e atualiza `currentStep` com texto legível.
  O wizard só escuta o documento.
- **Falha isolada.** Um item quebrado vira uma entrada em `errors[]` e o job
  segue; ao final, o status é `completed_with_errors`.
- **Cancelamento cooperativo.** O cliente só pode gravar `status: 'canceled'`; o
  worker verifica antes de cada item.
- **Idempotência.** Páginas são buscadas por `notionPageId` e bases por
  `notionDatabaseId`; reimportar atualiza no lugar em vez de duplicar.
- **Hierarquia.** A ordem é *depth-first*, e um `Map<notionId, appId>` alimenta
  tanto `parentPageId` quanto a reescrita de links internos.
