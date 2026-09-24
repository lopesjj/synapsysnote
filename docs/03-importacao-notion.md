# ETAPA 3 — Pipeline de importação do Notion

Arquivos:
[`api/notion/authorize`](../src/app/api/notion/authorize/route.ts) ·
[`api/notion/callback`](../src/app/api/notion/callback/route.ts) ·
[`api/notion/tree`](../src/app/api/notion/tree/route.ts) ·
[`api/notion/import`](../src/app/api/notion/import/route.ts) ·
[`api/notion/disconnect`](../src/app/api/notion/disconnect/route.ts) ·
[`src/lib/notion/server/`](../src/lib/notion/server/) ·
[`src/lib/notion/classify-import.ts`](../src/lib/notion/classify-import.ts)

O cliente autenticado chama as rotas Next.js. O Admin SDK lê o token
criptografado e fala com a API do Notion. Não há Cloud Function de importação:
todo o pipeline roda nas rotas do Next.js, em passos curtos.

## 1. OAuth 2.0

```
Usuário clica "Conectar" (logado no Synapsys)
   → POST /api/notion/authorize  { workspaceId }  + Bearer Firebase
        exige membership no workspace
        gera state = base64({nonce, workspaceId, uid})
        grava o state inteiro em cookie httpOnly
        devolve { redirectUrl }
   → browser → https://api.notion.com/v1/oauth/authorize
   → cada pessoa entra na PRÓPRIA conta Notion e escolhe páginas
   → GET /api/notion/callback?code=…&state=…
        cookie e state têm de ser idênticos (CSRF + anti-tamper)
        POST /v1/oauth/token  (Basic client_id:client_secret)
        criptografa access_token com AES-256-GCM
        grava no workspace daquela conta Synapsys:
          /workspaces/{id}/integrations/notion          ← metadados (connectedBy = uid)
          /workspaces/{id}/integrations/notion/secure/token ← ciphertext
   → 302 /home/integrations?connected=notion
```

A integração pública no portal do Notion precisa de escopo **Any workspace**.
Com *Selected workspaces only* só os espaços do desenvolvedor autorizam.

O envelope de criptografia é versionado (`v1.<iv>.<tag>.<ciphertext>`) para
permitir rotação de chave sem adivinhar o formato
([`token-cipher.ts`](../src/lib/crypto/token-cipher.ts)).

Reconexão é apenas repetir o fluxo (grava por cima). Revogação
(`POST /api/notion/disconnect`) revoga o token no Notion, marca `connected: false`, grava `revokedAt` e **apaga** o
documento do token.

## 2. Leitura da árvore

`GET /api/notion/tree` delega a
[`src/lib/notion/server/tree.ts`](../src/lib/notion/server/tree.ts).
`POST /v1/search` devolve uma lista plana com ponteiro `parent`; a hierarquia é
remontada localmente. Itens cujo pai não foi compartilhado com a integração
viram raízes em vez de sumirem — o usuário compartilhou aquela página, então
ela precisa aparecer no wizard.

Toda chamada passa por `throttled()`, que respeita o limite de ~3 req/s da API
e faz retry exponencial com jitter em 429/409/5xx.

## 3. Conversor recursivo

[`block-converter.ts`](../src/lib/notion/server/block-converter.ts) —
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
já foi importada (via `resolvePageLink`). As que apontam para páginas importadas
depois são reescritas no fim do job (`relinkImportedPages`), que também recalcula
`outgoingLinks`; o editor ainda resolve pelo `notionPageId` qualquer menção antiga
que tenha ficado com o id do Notion.

Proteções: profundidade máxima de 12 níveis (blocos sincronizados podem formar
ciclos) e paginação completa de `blocks.children.list`.

## 4. Bases de dados

[`property-mapper.ts`](../src/lib/notion/server/property-mapper.ts)

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

[`media.ts`](../src/lib/notion/server/media.ts)

A API do Notion entrega arquivos como **URLs presigned do S3 que expiram em ~1
hora**. Persistir esses links produz uma base inteira de imagens quebradas no dia
seguinte. Por isso, para cada arquivo:

1. `fetch(url)` com `redirect: follow`;
2. `pipeline(response.body → contador → file.createWriteStream())` — streaming
   puro, memória constante mesmo em vídeos grandes;
3. metadados com `firebaseStorageDownloadTokens` (URL permanente sem expiração)
   e `cacheControl: immutable`;
4. o bloco é reescrito com `url`, `storagePath`, `mimeType` e `sizeBytes`.

O download passa pela mesma validação do proxy de mídia (sem rede interna).

Limite configurável por `IMPORT_MAX_FILE_BYTES` (padrão 250 MB), aplicado tanto
pelo `content-length` quanto durante o stream.

## 6. Classificação: página, caderno ou nota

[`classify-import.ts`](../src/lib/notion/classify-import.ts).

Um item do Notion com filhos e **sem** corpo substantivo (só `child_page`,
divisores, sumário, breadcrumb) vira **notebook**: raiz → página na UI,
aninhado → caderno. Uma folha, ou qualquer coisa com texto, mídia, código,
tabela ou equação, vira **nota**. Bases / CSV nunca viram caderno.

`resolveImportPlacement` sobe os pais já classificados e pousa a nota no
caderno mais próximo, aninhando só sob outra nota. É o que impede a sidebar
de encher de “notas vazias” que no Notion eram só pastas.

## 7. Worker em passos

```
cliente  POST /api/notion/import
             └─ cria /workspaces/{ws}/import_jobs/{jobId}  status=pending
         PUT  /api/notion/import  { jobId }   (repetido pelo cliente até terminar)
             └─ pega o lease do job em transação (leaseUntil/leaseOwner, 2 min)
                        status=discovering  → lê a árvore e grava em import_jobs/{id}/meta/tree
                        status=running      → classifica → converte → rehospeda
                                              grava página / caderno / nota / base
                        reescreve menções e outgoingLinks
                        status=completed | completed_with_errors | failed
             └─ libera o lease
```

Cada `PUT` processa itens por até ~32 s e devolve o progresso. Se outra aba (ou um
retry do cliente) chamar enquanto o lease está com alguém, a resposta vem com
`busy: true` e o cliente espera 5 s — dois processos nunca trabalham no mesmo job.
Ao abrir o app, o provider retoma sozinho os jobs `pending`/`running` do usuário, então
fechar a aba só pausa a importação.

Por que o progresso mora no documento e não na resposta HTTP: importar milhares
de itens não cabe no tempo de uma requisição, e o cliente não pode ficar preso.

Detalhes que importam:

- **Progresso a cada item.** `ProgressReporter` usa `FieldValue.increment` nos
  contadores e atualiza `currentStep` com texto legível. O wizard só escuta o documento.
- **Árvore fora do documento principal.** `parents`, `orderedNodes` e `roles` ficam em
  `import_jobs/{id}/meta/tree`, para o job de um workspace grande não passar de 1 MiB.
- **Falha isolada.** Um item quebrado vira uma entrada em `errors[]` e o job
  segue; ao final, o status é `completed_with_errors`.
- **Cancelamento cooperativo.** O cliente só pode gravar `status: 'canceled'`; o
  worker verifica antes de cada item.
- **Idempotência.** Páginas são buscadas por `notionPageId` e bases por
  `notionDatabaseId`; reimportar atualiza no lugar em vez de duplicar. Título,
  ícone, conteúdo e posição vêm do Notion; favorito, tags, cor e ordem definidos
  no app são mantidos.
- **Reimportação não perde edição.** Se o texto da nota mudou desde a última
  importação, o conteúdo anterior vira uma versão ("antes de reimportar do
  Notion") antes de ser substituído. Arquivos que saíram vão para a quarentena.
- **Troca de papel.** Quando um item muda de papel (página que ganhou subpáginas
  vira caderno, caderno que perdeu os filhos vira nota), o documento antigo vai
  para a lixeira desvinculado do Notion — nada é apagado na hora. As subnotas de
  uma página que virou caderno passam para o novo caderno; o conteúdo de um
  caderno que virou nota vai para a lixeira junto com ele.
- **Limite de tamanho.** Uma página acima de ~900 KB de conteúdo vira erro do
  item (com orientação para dividi-la no Notion) em vez de derrubar o job.
- **Hierarquia.** A ordem é *depth-first*. O mapa de papéis (notebook / page /
  database) + `Map<notionId, appId>` alimenta `parentId` do caderno,
  `notebookId` / `parentPageId` da nota e a reescrita de links internos.
