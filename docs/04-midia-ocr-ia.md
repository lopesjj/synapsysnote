# ETAPA 4 — Mídia, OCR e IA

Arquivos: [`functions/src/ai/`](../functions/src/ai/) ·
[`functions/src/maintenance/trash.ts`](../functions/src/maintenance/trash.ts)

## 1. OCR com Cloud Vision

[`ocr.ts`](../functions/src/ai/ocr.ts) — `runOcrOnUpload` é um gatilho
`onObjectFinalized`, então cobre os dois caminhos de entrada de arquivo: upload
do usuário e rehospedagem vinda do Notion.

- **Imagens** → `documentTextDetection` direto na URI `gs://`.
- **PDFs** → `asyncBatchAnnotateFiles`, que escreve JSON de volta no Storage; a
  função aguarda a operação, concatena as páginas e apaga os arquivos
  intermediários.

O texto extraído é gravado em dois lugares: no bloco de mídia (para o leitor
expandir "texto OCR" inline) e em `page.extractedOCRText`, que é o campo lido
pela busca. Como o caminho do Storage está no bloco, a função localiza a página
mesmo quando não existe registro em `/attachments` — caso das mídias importadas.

`reprocessOcr` expõe a mesma rotina como callable, para reprocessamento manual.

## 2. Transcrição com Gemini

[`transcribe.ts`](../functions/src/ai/transcribe.ts) — o áudio vai inline para o
Gemini com `responseMimeType: application/json`, e uma única chamada devolve:

```json
{ "transcript": "…", "summary": "…", "actionItems": ["…"] }
```

Três portas de entrada, a mesma gravação no bloco: o callable `transcribeAudio`,
o gatilho `transcribeOnUpload` e `POST /api/ai/transcribe` no Next.js (usado
quando a Cloud Function falha ou não está implantada). O MIME enviado ao Gemini
é só `audio/webm` — `codecs=opus` no `Content-Type` faz a API recusar o arquivo.

O editor não substitui o documento quando só a transcrição muda (o caret
ficaria no fim da nota). A atualização entra por merge no bloco de mídia, e o
autosave recusa sobrescrever um `pending: false` com o rascunho ainda
`pending: true`.

Resultado: `media.transcript`, `media.transcriptSummary` no bloco e
`page.transcriptText` para a busca.

## 3. Embeddings e busca semântica

[`embeddings.ts`](../functions/src/ai/embeddings.ts)

`embedPageOnWrite` recalcula o vetor quando o texto pesquisável muda — e só
então, comparando o texto anterior com o novo para não entrar em laço com a
própria escrita do embedding.

O vetor (768 dimensões) é gravado como `FieldValue.vector(...)` e consultado por
`semanticSearch` com `findNearest`, distância COSINE, filtrando `deletedAt == null`.

**A busca é híbrida por composição:** o Command Palette roda a passada léxica
localmente ([`src/lib/search.ts`](../src/lib/search.ts)) contra o cache offline —
instantânea, funciona sem rede, cobre título, corpo, tags, OCR e transcrição com
pesos diferentes e um leve bônus de recência — e mistura com os vizinhos
vetoriais devolvidos pela função. Resultados que casaram por OCR ou transcrição
recebem um selo na interface, porque "por que isto apareceu?" é a primeira
pergunta de quem busca dentro de imagens.

## 4. Lixeira de 30 dias

[`trash.ts`](../functions/src/maintenance/trash.ts)

`purgeExpiredTrash` roda diariamente às 03:30 (America/Sao_Paulo): remove páginas
com `deletedAt` anterior ao corte, apaga as versões e os objetos do Storage
referenciados pelos blocos. `purgePage` faz o mesmo sob demanda a partir da tela
de lixeira — e apaga também os descendentes (`path` array-contains).
`restorePage` limpa `deletedAt`.

## 5. Inventário de funções

| Função | Tipo | Gatilho / uso |
| --- | --- | --- |
| `listNotionTree` | callable | árvore do wizard (o app usa `GET /api/notion/tree`) |
| `startNotionImport` | callable | enfileira o job (o app usa `POST /api/notion/import`) |
| `processNotionImportJob` | Firestore | worker longo (60 min, 1 GiB) no mesmo documento do job |
| `disconnectNotion` | callable | revoga e apaga o token (o app usa `POST /api/notion/disconnect`) |
| `runOcrOnUpload` | Storage | OCR de imagens e PDFs |
| `reprocessOcr` | callable | reprocessamento manual |
| `transcribeAudio` | callable | transcrição imediata |
| `transcribeOnUpload` | Storage | rede de segurança |
| `POST /api/ai/transcribe` | Next.js | fallback local / se a function falhar |
| `embedPageOnWrite` | Firestore | mantém vetores atualizados |
| `semanticSearch` | callable | `findNearest` |
| `purgeExpiredTrash` | agendada | retenção de 30 dias |
| `purgePage` / `restorePage` | callable | ações da lixeira |

Segredos usados: `TOKEN_ENCRYPTION_KEY` (Notion) e `GEMINI_API_KEY` (IA),
definidos via `firebase functions:secrets:set`.
