# ETAPA 4 — Mídia, OCR e IA

Arquivos: [`src/app/api/ai/`](../src/app/api/ai/) ·
[`src/lib/trash/purge-core.ts`](../src/lib/trash/purge-core.ts) ·
[`functions/src/maintenance/trash.ts`](../functions/src/maintenance/trash.ts)

## 1. OCR

Não há OCR automático. O campo `page.extractedOCRText` continua no modelo (é
somente do servidor nas regras) e a geração de flashcards o lê quando existir, mas
nenhuma rotina o preenche hoje. Para ligar OCR, o caminho previsto é uma função
`onObjectFinalized` que grave o texto nesse campo.

## 2. Transcrição com Whisper (Groq)

[`POST /api/ai/transcribe`](../src/app/api/ai/transcribe/route.ts) — a única
porta de entrada; não há Cloud Function de transcrição. O áudio vai para o
**Whisper hospedado no Groq** ([`groq-whisper.ts`](../src/lib/ai/groq-whisper.ts)),
modelo `GROQ_TRANSCRIBE_MODEL` (padrão `whisper-large-v3-turbo`), com a chave
`GROQ_API_KEY`. A resposta é `{ "transcript": "…", "language": "pt" }`.

O Gemini transcrevia e traduzia na mesma chamada e, no plano gratuito, passava
boa parte do tempo em "high demand": uma aula de 50 min ficava sem transcrição.
O Whisper do Groq transcreve uma hora de áudio em ~15 s.

**Cotas do plano gratuito do Groq** (da conta inteira, somando todos os
usuários): 20 requisições/min, 2.000/dia, **7.200 s de áudio por hora** e
**28.800 s por dia** (~8 h de aula), arquivo de até **25 MB** (100 MB no plano
pago). Um 429 diz no texto quanto esperar: espera curta a rota repete sozinha;
cota da hora ou do dia vira `QUOTA_EXCEEDED` no cliente, que para em vez de
gravar meia aula. `npm run check:whisper`
([script](../scripts/check-groq-whisper.mts)) confere a chave do `.env.local`
e mostra a cota restante.

**Alucinações.** A rota pede `verbose_json` e monta o texto pelos segmentos,
descartando só o que o próprio Whisper marca como silêncio (`no_speech_prob`
alto **e** `avg_logprob` baixo), laços de repetição (da terceira cópia seguida
em diante) e créditos de legenda aprendidos da internet ("Legendas pela
comunidade Amara.org").

Sem `GROQ_API_KEY`, ou quando o Groq não transcreve um arquivo pequeno, o
cliente pode reenviar o áudio como PCM cru para a mesma rota, que roda o Whisper
no servidor (`Xenova/whisper-base` quantizado), limitado a uma inferência por
instância e a 15 min de áudio.

**Idioma da transcrição.** O idioma escolhido no bloco é o idioma do texto
final, não uma dica de reconhecimento. O Whisper é chamado **sem** `language`:
transcreve no idioma que foi falado — forçar o idioma escolhido fazia o modelo
"traduzir" por conta própria, e mal. Quando o idioma falado (que o Whisper
informa) difere do escolhido, a rota traduz o texto pronto pelo mesmo caminho
de `/api/ai/translate`. Se a tradução falhar em qualquer pedaço, volta o
original inteiro — nunca um texto metade traduzido.

O editor não substitui o documento quando só a transcrição muda (o caret
ficaria no fim da nota). A atualização entra por merge no bloco de mídia, e o
autosave recusa sobrescrever um `pending: false` com o rascunho ainda
`pending: true`.

Resultado: `media.transcript`, `media.transcriptSummary` no bloco e
`page.transcriptText` para a busca.

## 2.1 Vídeo e aulas longas

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
decodifica a mídia **uma vez** em 16 kHz (`TRANSCRIPTION_SAMPLE_RATE`) e
extrai só a fala em Opus mono a 32 kbps (~14 MB por hora): um vídeo de 150 MB
vira um arquivo que cabe nos 25 MB do Groq. O download mostra progresso real, e
o encoder lê quadros de 20 ms sob demanda via `createMonoFrameReader`, sem
materializar a trilha inteira.

**A aula inteira vai numa chamada só.** Até ~78 min não há corte nenhum, então
não há emenda nem fala perdida. Gravações maiores são divididas em partes de
~1 h ([`speech-cuts.ts`](../src/lib/media/speech-cuts.ts)), sempre na **pausa
de fala** mais próxima de cada hora — nunca no meio de uma palavra, sem
sobreposição, e a emenda é concatenação simples em qualquer idioma. Até duas
partes sobem ao mesmo tempo (`TRANSCRIBE_CONCURRENCY`, um teto global da aba).
Se alguma parte não voltar, a transcrição falha em vez de ser entregue com
buraco. Enquanto a chamada única não volta, a barra avança por uma estimativa
de tempo que nunca chega ao fim antes da resposta. Coberto por
`npm run verify:transcription`.

Libras e flashcards transcrevem **só em memória** quando a mídia não tem
transcrição salva: nada é gravado na nota. O texto fica num cache da sessão
(e um pedido simultâneo da mesma mídia é reaproveitado), para que gerar
flashcards de novo ou abrir Libras depois não refaça a aula. Só o botão
"Transcrever" do bloco grava `media.transcript`.

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

Limite de uso ([`rate-limit.ts`](../src/lib/api/rate-limit.ts)): por usuário
logado (uid; o IP só quando não há sessão), 240
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

Por isso, quando a chave cai no IP, ela é crítica: [`client-ip.ts`](../src/lib/api/client-ip.ts)
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
porque gasta a cota do Groq (transcrição) e do Gemini.

## 3. Busca

O Command Palette faz busca léxica local ([`src/lib/search.ts`](../src/lib/search.ts))
sobre as notas já sincronizadas: instantânea, funciona sem rede e cobre título,
corpo, tags e transcrições, com pesos diferentes e um leve bônus de recência. Não
há embeddings nem busca vetorial.

## 4. Lixeira de 30 dias e quarentena de mídia

A exclusão definitiva tem um núcleo único, [`src/lib/trash/purge-core.ts`](../src/lib/trash/purge-core.ts),
usado pela rota `POST /api/trash/purge` e copiado para `functions/src/shared/` antes do deploy
das Functions (`scripts/sync-functions-shared.mjs`; o `verify:shared` confere a cópia).
O prazo vem de [`src/lib/trash/retention.ts`](../src/lib/trash/retention.ts) e é o mesmo
citado nos documentos legais.

- Antes de apagar um arquivo, confere se alguma nota, card, caderno ou linha de base
  ainda o usa; logo antes da exclusão, confere de novo o que foi gravado durante a
  varredura, para não apagar uma mídia colada em outra nota nesse meio-tempo.
- Mídia removida de uma nota, de um registro de base ou substituída numa
  reimportação do Notion vai para `trashed_media` (quarentena de 30 dias) e só é
  apagada se continuar sem uso quando vencer — contando também as versões salvas
  da nota de onde saiu.
- Versões de nota ficam 30 dias: a mesma função agendada apaga as mais antigas
  (consulta de grupo em `versions.createdAt`) e o histórico já não as mostra.
- `purgeExpiredTrash` (diária, 03:30 America/Sao_Paulo) acha os workspaces com itens
  vencidos por consulta de grupo e processa cada um com orçamento de tempo
  (timeout de 30 min). `purgeExpiredQuarantineMedia` faz o mesmo aos domingos.
- `purgePage` é a callable usada como alternativa quando a rota não responde.

## 5. Inventário

| Função / rota | Tipo | Uso |
| --- | --- | --- |
| `POST /api/ai/transcribe` | Next.js | transcrição via Whisper no Groq; Whisper local (uma inferência por instância) como alternativa |
| `POST /api/ai/flashcards/generate` | Next.js | geração de flashcards |
| `POST /api/ai/translate` | Next.js | Cloud Translation API; Gemini enquanto ela não estiver ativa |
| `POST /api/trash/purge` | Next.js | exclusão definitiva e limpeza vencida |
| `purgeExpiredTrash` | Function agendada | retenção de 30 dias (lixeira e versões) |
| `purgeExpiredQuarantineMedia` | Function agendada | quarentena de mídia |
| `purgePage` | Function callable | alternativa à rota de exclusão |

Região das Functions: `southamerica-east1` (a mesma do Firestore), definida em
`functions/src/region.ts` e em `NEXT_PUBLIC_FIREBASE_REGION`. Runtime Node.js 22.
