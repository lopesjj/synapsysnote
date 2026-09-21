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

## 2.1 Vídeo

Vídeo entra pelo mesmo bloco de mídia do áudio e vale o limite de 150 MB que
[`storage.rules`](../storage.rules) reserva para `video/*` em
`workspaces/{ws}/uploads/**` (os demais anexos seguem em 50 MB). Arquivos
acima disso passam por
[`compress-video.ts`](../src/lib/media/compress-video.ts) antes do upload: o
arquivo é redesenhado quadro a quadro em um canvas e regravado pelo
`MediaRecorder` na maior taxa de bits que ainda cabe no limite — a resolução só
cai quando os bits por pixel ficariam baixos demais, e nada é recodificado
quando o arquivo já cabe. São até três rodadas, corrigindo a taxa pelo tamanho
medido; se nem a última couber (ou o navegador não gravar vídeo), o anexo falha
com o toast de `video_too_large`. O processo é silencioso para quem escreve: o
bloco só mostra o estado de carregamento, e o motivo técnico de cada falha vai
para o console.

A recodificação roda em tempo real (o arquivo é reproduzido enquanto é gravado),
então há um teto de duração: `maxCompressibleDuration` devolve o ponto em que o
orçamento de bits cai abaixo do mínimo de 260 kbps, limitado a 30 minutos —
mais que isso seria meia hora de espera. Acima disso o anexo é recusado de
saída com `video_too_long`,
que pede um trecho mais curto em vez de gastar o tempo inteiro do vídeo para
devolver uma imagem irreconhecível. Em vídeo longo o áudio cai para 64 kbps e a
captura para 24 quadros por segundo, deixando mais bits para a imagem.

Para transcrever, [`audio-transcriber.ts`](../src/lib/accessibility/audio-transcriber.ts)
extrai só a fala (`extractAudioForTranscription` → Opus mono) antes de chamar a
API — vídeo inteiro estouraria o limite de arquivo embutido do Gemini. A
trilha nunca é materializada inteira: a decodificação sai direto em 16 kHz
(`TRANSCRIPTION_SAMPLE_RATE`), o encoder lê quadros de 20 ms sob demanda via
`createMonoFrameReader` e o caminho local do Whisper monta um pedaço de 60 s por
vez. Sem isso, uma aula de uma hora custaria mais de 1 GB de RAM só nos vetores
intermediários — o suficiente para derrubar a aba no celular. O
resultado é gravado em `media.transcript` do mesmo jeito que no áudio, e é o
que os flashcards e a exportação em PDF leem.

**Uma aula inteira vai em uma chamada só.** `transcribeWholeSpeech` extrai a
fala do vídeo para um Opus mono (50 min ≈ 9 MB), manda numa única requisição, e
a rota sobe o arquivo pela **Files API** do Gemini quando ele passa de 6 MB —
o corpo embutido tem teto de ~20 MB, a referência por `fileUri` não tem. Medido
com a chave do projeto: 50 min de áudio custam **75.012 tokens de entrada**
(25 tokens por segundo), o upload de 22,9 MB leva 4,2 s e a resposta volta em
6,0 s no `gemini-3.5-flash`.

Isso importa por causa da cota, não da velocidade: no plano gratuito cada
modelo flash tem **20 requisições por dia**. Fatiada em trechos de 3 min, uma
aula de 50 min consumia 18 dessas 20 — quase o dia inteiro para um vídeo. Em
uma chamada, consome uma.

O caminho fatiado (`extractAudioSegments`, trechos de 3 min com 5 s de
sobreposição) continua como reserva, e é acionado em dois casos: quando não dá
para extrair a fala inteira, e quando a resposta única volta `TRUNCATED` — o
teto de saída cortou a aula no meio, e só fatiado cada pedaço cabe. Quando o Gemini devolve 503 (modelo
congestionado), a rota percorre a lista de modelos dentro de um orçamento de
120 s e o cliente reenvia o trecho uma vez informando a rodada em
`x-transcribe-attempt`; a rota então **começa a lista em outro ponto**, porque
`gemini-flash-latest` é apelido do mesmo pool do flash mais novo e tentá-lo
logo depois do preferido era entrar duas vezes na mesma fila. Os trechos que
ficaram para trás ganham uma segunda passada no fim, quando o congestionamento
costuma já ter passado.

**Em áudio, a disponibilidade é outra.** A lista de
[`transcribe-models.ts`](../src/lib/ai/transcribe-models.ts) veio de medição com
a chave do projeto, no mesmo minuto: `gemini-3.7-flash` aceitava texto mas
devolvia **429 de cota** em áudio, `gemini-3.8-flash` e
`gemini-flash-lite-latest` davam 503 "high demand", `gemini-2.5-flash-lite`
saiu do ar com 404 — e `gemini-3.5-flash` transcreveu 3 min de áudio em 5 s.
Daí três regras. O padrão de transcrição é `GEMINI_TRANSCRIBE_MODEL`
(`gemini-3.5-flash-lite`), e **não** o `GEMINI_MODEL` que vale para texto: o
lite tem 500 requisições por dia e 15 por minuto, contra 20 e 5 dos flash.
Um 429 é problema *daquele* modelo, não do pedido — a cadeia segue para o
próximo em vez de abortar tudo; antes, o primeiro modelo sem cota matava a
transcrição inteira em menos de um segundo. E o modelo que recusou entra em
descanso ([`model-cooldown.ts`](../src/lib/ai/model-cooldown.ts)): 30 min para
cota de dia, pouco mais de um minuto para cota de minuto, 90 s para 503 e 12 h
para um nome que não existe, honrando o `retryDelay` que vem no próprio 429.
Sem essa memória, cada trecho recomeçava pelo mesmo modelo morto.

A cota do dia e a do minuto não são a mesma coisa, e o corpo do 429 diz qual
estourou: a do minuto passa sozinha e vale reenviar; a do dia não volta hoje, e
a transcrição falha com `QUOTA_EXCEEDED` em vez de gravar meia aula na nota
como se fosse a transcrição inteira. Houve uma versão que girava a lista de
modelos a cada tentativa para fugir de fila cheia — com a cota medida isso era
nocivo, porque empurrava a retentativa para os modelos de 20/dia; quem evita
repetir modelo morto agora é o descanso, que sabe qual recusou e por quanto
tempo.

`npm run check:gemini-audio`
([script](../scripts/check-gemini-audio.mts)) refaz essa medição quando a
transcrição parar de funcionar: manda texto, 3 s de áudio e 3 min de áudio para
cada modelo e imprime status e tempo, usando a chave do `.env.local`.

Nada disso pode virar espera infinita: o tempo gasto em trechos recusados tem
teto de 5 min. Estourado o teto, vale o que já foi transcrito, e cada buraco
aparece como `[…]` no texto — emendar calado entregaria uma aula com oito
minutos faltando sem ninguém perceber. Só quando nenhum trecho passa é que a
transcrição falha com `SERVICE_BUSY`; antes bastava o primeiro trecho voltar
503 para o vídeo inteiro ser abandonado. Dentro da mesma sessão o texto obtido
fica em memória (`reuseCache`), para que gerar flashcards de novo com outra
quantidade não pague download, decodificação e chamadas outra vez. Coberto por
`npm run verify:transcription`.

Sem transcrição e sem mais nada na nota, a geração de flashcards **não roda**:
[`generate/route.ts`](../src/app/api/ai/flashcards/generate/route.ts) recusa com
`NO_CONTENT` quando só sobrou o título. O modelo que recebe apenas instruções
devolve cards sobre as próprias instruções — dez cartões sobre princípios de
flashcard, que era exatamente o que aparecia na tela.

## 2.2 Proxy de mídia

[`proxy/route.ts`](../src/app/api/media/proxy/route.ts) existe porque nem toda
mídia de uma nota mora no Storage do projeto — ícone colado por URL, capa
externa, imagem importada que não foi rehospedada —, então não dá para usar
allowlist de hosts. A defesa está em
[`proxy-guard.ts`](../src/lib/media/proxy-guard.ts), coberta por
`npm run verify:media-proxy`:

| Risco | Proteção |
| --- | --- |
| SSRF | só `http`/`https`; DNS resolvido antes do fetch e recusado se qualquer endereço for privado, loopback, link-local (metadata), CGNAT ou multicast; redirecionamento seguido à mão, revalidando cada salto |
| XSS na origem do app | `content-type` passa por allowlist; o que não for mídia desce como `application/octet-stream` + `attachment`, sempre com `nosniff` e CSP `sandbox` |
| Memória | corpo repassado como stream com teto de 160 MB, em vez de `arrayBuffer()` — um vídeo de 150 MB por requisição derrubava a instância de 1 GiB |
| Abuso anônimo | sessão Firebase exigida (cookie), `Sec-Fetch-Site: cross-site` recusado, `Cache-Control: private`, sem CORS aberto |

Limite de uso ([`rate-limit.ts`](../src/lib/api/rate-limit.ts)): por IP, 240
requisições/min, 8 simultâneas e **2 GiB/min de banda** no proxy; 60
requisições/10 min e 3 simultâneas na transcrição. O teto de banda é o que
importa: contar requisições punia quem abre uma nota cheia de imagens ou arrasta
a linha do tempo de um vídeo (cada busca é um `Range`). Vale **por instância** —
com `maxInstances: 8` o teto real é multiplicado.

Não há limite de borda para completar isso: o Cloud Armor só aplica throttle em
política de *backend*, anexada a um backend service de load balancer do projeto,
e o Firebase App Hosting não expõe nenhum — o balanceador e o CDN são
infraestrutura gerenciada. Política do tipo `CLOUD_ARMOR_EDGE` não suporta rate
limiting.

Por isso a chave do limite é crítica: [`client-ip.ts`](../src/lib/api/client-ip.ts)
pega o **penúltimo** elemento do `X-Forwarded-For`, porque atrás do balanceador
do Google o header chega como `<valor-do-cliente>,<client-ip>,<lb-ip>` e nada
antes dos dois últimos é validado. Usar o primeiro elemento — o reflexo comum —
deixaria qualquer um trocar de balde a cada requisição, tornando todo teto
decorativo. O número de saltos confiáveis sai de `TRUSTED_PROXY_HOPS` (padrão 1)
e a primeira requisição de cada instância registra o formato real no log, para
confirmação em produção.

O `Range` recebido é repassado e o 206 volta com `Content-Range`, para o player
de vídeo buscar posição sem baixar o arquivo inteiro. A rota de transcrição usa a
mesma verificação de sessão ([`app-session.ts`](../src/lib/api/app-session.ts)),
porque gasta quota paga do Gemini.

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
