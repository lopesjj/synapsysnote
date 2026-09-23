# Auditoria técnica, legal e de dados — Synapsys Note

Data: 2026-09-23 · Versão analisada: `1.16.13` (commit `ed419b2`) · Revisão 2: correções e estado do Firebase em produção

## 0. Escopo e método

Foram lidos e cruzados entre si:

- regras (`firestore.rules`, `storage.rules`, `firestore.indexes.json`) e configuração
  (`firebase.json`, `apphosting.yaml`, `next.config.ts`, `.env.example`);
- camada de dados (`src/lib/data/*`, `src/hooks/*`), editor e autosave;
- todas as rotas `src/app/api/**` e o middleware `src/proxy.ts`;
- Cloud Functions (`functions/src/**`);
- documentos legais (`src/lib/legal/**`, os 10 idiomas), banner e preferências de cookies;
- scripts operacionais (`scripts/account-ops.mts`) e documentação (`docs/*`). O `README.md`
  foi desconsiderado por estar desatualizado.

Checagens executadas:

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` (app) | OK |
| `npx tsc --noEmit` (functions) | OK |
| `npx eslint` | **Falha: 77 erros, 60 avisos** |
| `npm run verify` | **Falha em `verify:page-tree`**; a cadeia `&&` para ali |
| `verify:*` restantes, um a um | todos OK, exceto `verify:firebase-admin` (exige credencial real) |

Firebase em produção (revisão 2, com a chave da conta de serviço
`firebase-adminsdk-fbsvc`, só leitura): foram lidos a configuração do Firestore
(local, PITR, TTL, índices), as regras publicadas, a configuração do Auth, o bucket,
o faturamento e contagens agregadas de documentos. A conta **não tem permissão**
(HTTP 403) para listar Cloud Functions, Cloud Scheduler, App Hosting, Secret Manager,
Logging, IAM e backups, e a API do App Check está desativada no projeto. A leitura em
massa do conteúdo (notas, usuários, arquivos) não foi feita. Pontos que dependem
disso seguem marcados como **[verificar no console]**. O resultado está na seção 1.8.

Correções em relação à primeira versão deste relatório:

- **L8**: o logout pelo menu **consegue** apagar o IndexedDB (o SDK do Firestore encerra
  a instância ao receber o pedido de exclusão); o problema real é o logout via
  `?logout=1` e o cache persistente sem "Manter conectado".
- **P8** (nome de arquivo) retirado: não é uma falha real.
- **F7** rebaixado para Baixo: não há caso atual de perda; a exclusão dupla é só redundante.
- **L3** rebaixado para Médio: o projeto tem faturamento ativo.
- **L12** retirado: a localização dos dados confere com a Política.
- **L13**: o GitHub está desativado no Auth; é só código morto.
- **Q2**: são 20 verificações bloqueadas, não 19.
- A primeira resposta citou "31 rotas de API"; são 32.
- As menções ao `README.md` foram removidas.

Severidade: **Crítico** (perda de dados/violação legal provável), **Alto**,
**Médio**, **Baixo**.

---

## 1. Inconsistências, divergências e bugs

### 1.1 Documentos legais, LGPD e cookies

| ID | Sev. | Problema | Evidência |
|---|---|---|---|
| L1 | Alto | As regras permitem que o navegador grave `legalAcceptedVersion` / `legalAcceptedAt` em `users/{uid}`. O código afirma o contrário ("as regras do Firestore não deixam o navegador escrever esses campos"). A "prova do aceite" pode ser forjada ou apagada pelo próprio usuário. | `firestore.rules:72-77`; `src/app/api/legal/accept/route.ts:9-13`; `src/lib/data/user-profile.ts:64-67` |
| L2 | Alto | O reaceite dos Termos/Política **nunca é solicitado**: `legalAcceptanceRequired()` não é usado em lugar nenhum. Se o POST de aceite falhar no cadastro (erro engolido com `.catch(() => {})`), ou se `LEGAL_VERSION` mudar, ou para contas anteriores à v1.0, o usuário segue sem aceite registrado. O comentário "o app pede o aceite de novo na entrada" é falso. | `src/lib/data/user-profile.ts:29-35`; `src/hooks/use-auth.tsx:475-478`; `src/components/auth/registration-gate.tsx` |
| L3 | Médio [verificar] | A Política promete "nunca usamos seu conteúdo para treinar modelos", mas o `.env.example` descreve cotas do **plano gratuito** da Gemini API. Nos termos da Gemini API, o conteúdo enviado em serviços não pagos pode ser usado pelo Google para melhorar produtos. O projeto `synapsysnote` tem faturamento ativo (confirmado), então a promessa vale **se** a `GEMINI_API_KEY` for deste projeto; a origem da chave não pôde ser conferida. | `.env.example` (seção 5); `src/lib/legal/documents/pt.ts` (seções `ai`, `highlights`) |
| L4 | Médio | Tradução usa o endpoint **não oficial** `translate.googleapis.com/translate_a/single?client=gtx` (com User-Agent de navegador). Não há contrato/DPA; a Política lista o "Google Tradutor" como operador "sob obrigações de confidencialidade". Além do risco contratual, o endpoint pode ser bloqueado a qualquer momento. | `src/app/api/ai/translate/route.ts:53-68` |
| L5 | Alto | **Exclusão de conta incompleta**: não apaga `integrations` nem `integrations/*/secure/token` (tokens OAuth cifrados), `attachments`, `import_jobs` (+`logs`); não revoga os tokens no Notion/Google/Evernote. A Política diz que tokens ficam guardados "até você desconectar a integração ou excluir a conta". | `scripts/account-ops.mts:171-259` |
| L6 | Médio | **Exportação (portabilidade) incompleta**: gera só um JSON com a *lista* de arquivos (nome/tamanho), não os arquivos; omite `attachments`, `import_jobs`, integrações, registros de acesso do titular. | `scripts/account-ops.mts:57-149` |
| L7 | Médio | Retenção de `access_logs` (6 meses, Marco Civil) depende de uma **política de TTL** do Firestore em `expiresAt`. **Confirmado em produção: não existe nenhuma política de TTL no banco.** A coleção ainda não existe (o recurso é do commit `ed419b2`, de hoje); assim que for implantado, os registros ficarão para sempre, contrariando a Política. | `src/lib/auth/access-log-server.ts:7-34` |
| L8 | Médio | **Cópia local persistente das notas**: `persistentLocalCache` guarda todo o workspace no IndexedDB mesmo com "Manter conectado" desmarcado. O logout pelo menu apaga essa base (o SDK encerra a instância ao receber o pedido de exclusão), mas o logout via `?logout=1` (troca de domínio) não limpa nada — nem o IndexedDB, nem `synapsys.auth_user`, nem o cache `synapsys.cache.*`. A Política de Cookies chama isso de "cópia temporária". | `src/lib/firebase/client.ts:52-71`; `src/hooks/use-auth.tsx:183-209`, `272-283` |
| L9 | Médio | Arquivos acessíveis por **URL pública com token** (`getDownloadURL`, token permanente) gravada nas notas: quem tiver o link acessa sem login, contornando `storage.rules`. A Política afirma "regras de acesso que isolam os dados de cada conta… no armazenamento de arquivos". | `src/lib/data/firestore-adapter.ts:1551,1630`; `src/app/api/media/copy/route.ts:60-66` |
| L10 | Baixo | Controlador sem razão social/CNPJ e sem **Encarregado** (art. 41 LGPD) identificado; só um e-mail. | `src/lib/legal/entity.ts:11-17` |
| L11 | Baixo | O IP do visitante vai para o log do servidor (uma linha por instância) — não mencionado na Política. | `src/lib/api/client-ip.ts:65-74` |
| L12 | — | ~~Localização dos dados~~ **Conferido, sem divergência**: Firestore em `southamerica-east1` (São Paulo) e bucket em `US-EAST1`, como a Política declara ("Brasil e Estados Unidos"). Ver FB7 sobre latência. | `pt.ts` seção `transfer` |
| L13 | Baixo | Login com **GitHub** existe no código (`OAuthProviderId = "google" \| "github"`), mas o provedor está **desativado no Auth** (confirmado) e não aparece na interface: é código morto. Termos/Política (e-mail e Google) estão corretos. | `src/hooks/use-auth.tsx:71,358-364` |

Pontos conferidos e **consistentes**: nomes e durações dos cookies da Política
batem com o código (`synapsys_session` 12 h/7 dias, `synapsys_consent` 12 meses,
`synapsys_site_lang`/`synapsys_lang` 12 meses, `*_oauth_state` 10–15 min,
`synapsys_geo` 30 dias); a consulta GeoIP (`api.country.is`) só ocorre com
consentimento; a recusa apaga o cookie funcional; não há Analytics inicializado
(embora exista `measurementId`); a confirmação de idade existe no cadastro; os 10
idiomas têm a mesma estrutura de seções.

### 1.2 Persistência (Firestore/Storage)

| ID | Sev. | Problema | Evidência |
|---|---|---|---|
| P1 | **Crítico** | **Conteúdo de toda nota gravado em dobro.** `hasUnsupportedFirestoreArrays` marca qualquer bloco com `richText` como "não suportado", e o `...patch` reinsere `blocks` no payload. Cada `updatePage` grava `blocks` (cru, **sem** o merge de mídia) **e** `blocksJson`. Efeitos: dobra tamanho, banda e custo de leitura; o limite de 900 KB (que mede os dois) corta notas pela metade do tamanho real; `blocks` fica divergente de `blocksJson`. Reproduzido isoladamente. | `src/lib/data/firestore-adapter.ts:117-133`, `909-935` |
| P2 | Médio | A checagem de tamanho existe só no `updatePage`; `createPage`, `snapshotVersion` e importações podem estourar o limite de 1 MiB do documento e falhar sem mensagem clara. | `firestore-adapter.ts:777-851`, `1227-1260` |
| P3 | Médio | Cada autosave (a cada ~900 ms digitando) faz `getDoc` + `updateDoc` **e** chama `/api/media/quarantine` com **todos** os caminhos de mídia da nota, que executa um `delete` no Firestore por caminho. Nota com 50 imagens = 50 escritas extras por autosave. | `firestore-adapter.ts:858-907` |
| P4 | Médio | Operações de árvore não atômicas: `deleteNotebook`/`restoreNotebook`/`trashPage` são quebradas em lotes de 400 (falha no meio deixa árvore meio na lixeira); `movePage` usa **um único** batch sem divisão — falha com mais de 500 descendentes. | `firestore-adapter.ts:582-626`, `657-690`, `986-1017`, `1049-1062` |
| P5 | Médio | `deleteNotebook`, `duplicateNotebook` e `duplicatePage` baixam a coleção **inteira** de páginas (com conteúdo) para achar a subárvore. | `firestore-adapter.ts:510-518`, `582-587`, `853-856` |
| P6 | Baixo | Coleção `attachments`: criada no upload, nunca lida pelo app, não apagada na limpeza da lixeira nem na exclusão de conta (documentos órfãos). Áudio não cria registro (inconsistente). | `firestore-adapter.ts:1632-1641`; `src/lib/trash/purge-server.ts:168-228` |
| P7 | Médio | Job de importação do Notion guarda `items` + `treeMetadata` (árvore inteira) num único documento: workspaces grandes (milhares de páginas) passam de 1 MiB e a importação falha na descoberta. `import_jobs` nunca é limpo. | `src/lib/notion/server/run-import.ts:779-809` |
| P8 | — | ~~Nome de arquivo sem sanitização~~ **Retirado**: o navegador não entrega nomes com `/` e o SDK codifica os demais caracteres; não há falha real. | `firestore-adapter.ts:1608` |
| P9 | Baixo | Erros das assinaturas são engolidos (`() => {}`); no erro dos flashcards, `cb([])` sobrescreve o cache local com lista vazia. | `firestore-adapter.ts:333-347`, `1808-1820` |
| P10 | Baixo | `purgeLegacyInbox` atualiza páginas sem `updatedBy` — viola a regra de update quando o último editor foi outro membro. | `firestore-adapter.ts:751-775` |
| P11 | Baixo | Prazo de 30 dias da lixeira/quarentena definido em 5 lugares (um deles configurável por env nas Functions), podendo divergir da Política. | `provider.tsx:119`; `purge-server.ts:12`; `functions/.../trash.ts:10`; `entity.ts:29`; `api/media/quarantine/route.ts:114` |
| P12 | Baixo | `NEXT_PUBLIC_DEFAULT_WORKSPACE_ID` é documentado como "workspace compartilhado", mas as regras (`isPersonalWorkspace`) e `ensureWorkspace` impedem um segundo usuário. | `.env.example`; `src/lib/api/session.ts:36-97` |

### 1.3 Controle de concorrência

| ID | Sev. | Problema | Evidência |
|---|---|---|---|
| C1 | **Crítico** | **Última gravação vence no conteúdo da nota.** O autosave envia o array `blocks` inteiro; `updatePage` lê e depois grava sem pré-condição (sem revisão/transação); o editor aplica a versão remota após 4 s ocioso. Duas abas/aparelhos editando = edições perdidas silenciosamente. | `firestore-adapter.ts:858-955`; `src/components/editor/block-editor.tsx:813-867` |
| C2 | Médio | Worker de importação do Notion **sem lease/lock**: duas abas, ou o retry do cliente após timeout, executam `runNotionImportStep` no mesmo job em paralelo → itens processados duas vezes, páginas/mídias duplicadas, contadores errados. | `src/app/api/notion/import/route.ts:51-63`; `run-import.ts:715-760`; `firestore-adapter.ts:1416-1460` |
| C3 | Médio | Revisão de flashcard faz leitura-cálculo-escrita sem transação (duplo clique ou dois aparelhos perdem uma revisão / SRS calculado com estado velho). | `firestore-adapter.ts:1908-1922` |
| C4 | Médio | Corrida limpeza × edição: `referencedPaths` tira a foto do workspace e só depois apaga; mídia colada em outra nota nesse intervalo é apagada. Quarentena/desquarentena são "fire-and-forget" e podem chegar fora de ordem. | `src/lib/trash/purge-server.ts:95-228`; `firestore-adapter.ts:899-906` |
| C5 | Baixo | Rate limit em memória por instância e por IP (8 instâncias multiplicam o teto; alunos atrás do mesmo NAT de faculdade/biblioteca recebem 429). | `src/lib/api/rate-limit.ts`; rotas `api/ai/*`, `api/media/proxy` |

### 1.4 Escalabilidade para múltiplos usuários

| ID | Sev. | Problema | Evidência |
|---|---|---|---|
| S1 | Alto | O cliente assina **todas** as páginas com conteúdo completo; a cada snapshot refaz `JSON.parse` de todas (não usa `docChanges`) e regrava o cache no `localStorage`. Custo de leitura, banda e CPU crescem com o número de notas e a cada autosave. | `firestore-adapter.ts:341-347`; `src/lib/data/provider.tsx:185-191` |
| S2 | Alto | A limpeza da lixeira varre o workspace **inteiro** (todas as páginas, todas as bases e as linhas de cada uma em sequência, todos os flashcards) a cada exclusão definitiva — inclusive de uma única nota. A função agendada percorre **todos** os workspaces em série, com `limit(200)` e timeout padrão (60 s). | `purge-server.ts:95-132`; `functions/src/maintenance/trash.ts:96-133`, `223-250` |
| S3 | Médio | Whisper roda **dentro do servidor web**: modelo baixado do Hugging Face em tempo de execução (vai para o FS em memória do Cloud Run), numa instância de 1 vCPU/1 GiB com concorrência 80 → CPU disputada com todas as outras requisições e risco de OOM. | `src/app/api/ai/transcribe/route.ts:48-67`; `apphosting.yaml:4-9` |
| S4 | Médio | Importação do Notion depende da aba aberta "bombeando" `PUT /api/notion/import`; fechar a aba para o job; 5 erros seguidos abandonam o loop. A doc cita a função `processNotionImportJob` como rede de segurança, mas ela não é exportada. | `firestore-adapter.ts:1416-1460`; `functions/src/index.ts` |
| S5 | Baixo | Um listener por base de dados (`rows`) — N+1 conexões. | `firestore-adapter.ts:349-422` |
| S6 | Baixo | `treeFor` é O(n²) (`scope.some` dentro do laço) e `pageById` é O(n). | `provider.tsx:271-285`, `318` |
| S7 | Baixo | `account-ops` lê **todos** os workspaces do projeto para achar os do usuário. | `scripts/account-ops.mts:64-73`, `177-189` |

### 1.5 Integração com Cloud Functions

| ID | Sev. | Problema | Evidência |
|---|---|---|---|
| F1 | Alto | **Região divergente**: as functions são implantadas em `us-east1` (padrão, sem `functions/.env`), mas o cliente chama em `us-central1` (`NEXT_PUBLIC_FIREBASE_REGION`). O fallback `httpsCallable("purgePage")` provavelmente aponta para uma função inexistente (a conta de serviço não tem permissão para listar as funções implantadas). | `functions/src/index.ts:5`; `functions/src/maintenance/trash.ts:9`; `apphosting.yaml` (`NEXT_PUBLIC_FIREBASE_REGION`); `src/lib/firebase/config.ts:34-36`; `firestore-adapter.ts:1151` |
| F2 | Alto | Runtime **Node.js 20**, que chegou ao fim do suporte em 30/04/2026; o Google descontinua o runtime e bloqueia novos deploys depois do prazo de desativação. | `firebase.json` (`"runtime": "nodejs20"`); `functions/package.json` (`engines`) |
| F3 | Médio | Funções agendadas sem `timeoutSeconds` (padrão 60 s) e com varredura completa (S2): vão estourar o tempo à medida que a base cresce; o que passa de `limit(200)` acumula. | `functions/src/maintenance/trash.ts:223-293` |
| F4 | Médio | **Código morto e documentação divergente**: `functions/src/notion/*`, `functions/src/ai/*` e `lib/crypto.ts` não são exportados. `docs/03` e `docs/04` descrevem OCR com Cloud Vision (`runOcrOnUpload`, `reprocessOcr`; `ocr.ts` nem existe), embeddings e o worker `processNotionImportJob`. Na prática `extractedOCRText` e `embedding` nunca são preenchidos, mas a geração de flashcards lê `extractedOCRText`. Em produção não há índice vetorial (confirmado). | `functions/src/index.ts`; `docs/03`, `docs/04`; `src/lib/flashcards/extract-note-content.ts:229` |
| F5 | Médio | Lógica de exclusão definitiva **duplicada** em dois lugares (`functions/src/maintenance/trash.ts` e `src/lib/trash/purge-server.ts`), já com diferenças. | — |
| F6 | Médio | `/api/media/quarantine` com `action: "purge_expired"` apaga arquivos **sem** verificar se ainda estão em uso (ao contrário de `purgeExpiredQuarantine`). Não é usado pelo app, mas está exposto a qualquer editor. | `src/app/api/media/quarantine/route.ts:57-94` |
| F7 | Baixo | `deleteMedia` apaga **duas vezes**: chama `/api/media/delete` e, em seguida, `deleteObject` no cliente para os mesmos caminhos (redundante). Revisado: os chamadores atuais só apagam arquivos exclusivos (upload recém-feito, imagem própria do card; cópias de card sem arquivo próprio ficam com `storagePath: null`), então não encontrei caso real de perda — mas a rota não confere referências, e um uso futuro pode apagar arquivo compartilhado. | `firestore-adapter.ts:1726-1749`; `src/app/api/media/delete/route.ts:66-88`; `src/lib/data/duplicate.ts:78-112` |
| F8 | Baixo | `/api/media/delete` faz uma consulta por caminho em `attachments` (N consultas). | `src/app/api/media/delete/route.ts:77-88` |

### 1.6 Segurança relacionada

| ID | Sev. | Problema | Evidência |
|---|---|---|---|
| X1 | Médio | Regras do Storage sobrepostas: `uploads/icons/{fileName}` também casa com `uploads/{pageId}/{fileName}` (`pageId = "icons"`). Como basta uma regra permitir, as restrições de ícone (só imagem, 10 MB) são contornáveis (qualquer tipo permitido até 50/150 MB). Em produção a situação é pior: ver FB1. | `storage.rules:54-72` |
| X2 | Médio | reCAPTCHA e contador de tentativas existem **só no cliente** (`localStorage`); o login vai direto ao Firebase Auth, então basta chamar a API REST do Auth para ignorar. Cadastro não tem captcha. **Confirmado no Auth**: a integração reCAPTCHA para e-mail/senha não está ativada (há 3 chaves reCAPTCHA no projeto), App Check desativado, sem política de senha e sem MFA. | `src/lib/auth/login-attempts.ts`; `src/app/[lang]/(public)/page.tsx:141,208` |
| X3 | Médio | Regras de `members`: um `admin` pode criar/atualizar membros (inclusive a si mesmo) com `role: 'owner'`. | `firestore.rules:101-121` |
| X4 | Baixo | Sem cabeçalhos de segurança nas páginas (CSP, `frame-ancestors`/X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy). | `next.config.ts` |
| X5 | Baixo | Logout só apaga o cookie; a sessão não é revogada no servidor (cookie copiado continua válido até 7 dias). | `src/app/api/auth/session/route.ts:48-55` |
| X6 | Baixo | Worker do pdf.js e CSS do KaTeX vêm do jsDelivr sem SRI; o CSS é da versão **0.16.9**, o pacote instalado é **^0.18.5** (renderização divergente no PDF). | `src/lib/export/export-note-pdf.ts:711,874`; `compress-attachment.ts:260`; `extract-note-content.ts:121` |

### 1.7 Qualidade, testes e documentação

| ID | Sev. | Problema | Evidência |
|---|---|---|---|
| Q1 | Médio | `npm run lint` falha com **77 erros**: 27 `react-hooks/refs`, 23 `set-state-in-effect`, 12 `no-explicit-any`, 10 `immutability`, 3 `static-components` (componentes `NavItem` recriados a cada render em `app-shell.tsx:594-606`, que remontam e perdem estado), 1 `purity` (`Date.now()` no render em `trash/page.tsx:71`), 1 `no-require-imports` (functions). | saída do `eslint` |
| Q2 | Médio | `verify:page-tree` falha: o teste ainda espera que excluir caderno o remova e zere `notebookId` das notas, mas a implementação atual manda para a lixeira com `trashedWith`. Como `verify` encadeia com `&&`, as 20 verificações seguintes nunca rodam no script agregado. | `scripts/verify-page-tree.mts:103-131` |
| Q3 | Baixo | `verify:firebase-admin` exige credencial real — não é hermético. Não há CI (`.github/` inexistente). | `scripts/verify-firebase-admin.mts` |
| Q4 | Baixo | `docs/08-firebase-console.md` tem regras desatualizadas (sem `flashcards` e `trashed_media`); colar aquele texto no Console **quebra os flashcards**. Também cita Vercel como hospedagem (os domínios autorizados em produção estão corretos, sem Vercel). | `docs/08-firebase-console.md` |

### 1.8 Estado do Firebase em produção (lido com a chave)

| ID | Sev. | Achado |
|---|---|---|
| FB1 | Alto | **Regras do Storage publicadas estão desatualizadas e mais permissivas que as do repositório** (publicadas em 2026-09-20): `workspaces/{id}/uploads/icons/*` tem `allow read: if true` (leitura **pública, sem login**), sem restrição de tipo de arquivo; e `users/{uid}/*` pode ser lido por **qualquer usuário logado**. O repositório já corrige os dois, mas não foi publicado. |
| FB2 | Médio | **`firestore.indexes.json` não está publicado**: 0 índices compostos e 0 exceções de campo. `pages.blocks`, `blocksJson`, `plainText` e `extractedOCRText` estão indexados no padrão (crescente, decrescente e array-contains), o que aumenta custo de armazenamento de índice e latência de escrita — e, somado a P1, a cópia duplicada `blocks` também é indexada. Conferi as consultas do código: nenhuma depende de índice composto, então nada quebra hoje. |
| FB3 | Médio | **Nenhuma política de TTL** no banco (ver L7). |
| FB4 | Médio | **PITR desativado** e **proteção contra exclusão do banco desativada**. Backups agendados não puderam ser conferidos (sem permissão). Os Termos citam "fazer backups". |
| FB5 | Médio | **Auth**: e-mail/senha e Google ativos (GitHub desativado); proteção contra enumeração de e-mails **ativa** (ok); integração reCAPTCHA para e-mail/senha **não ativada**; MFA desativado; sem política de senha (mínimo padrão de 6 caracteres); sem blocking functions. **App Check** não está em uso (API desativada). |
| FB6 | Baixo | Bucket com **CORS `origin: *`** para GET/HEAD/PUT/POST/DELETE; o ideal é restringir aos domínios do app. *Soft delete* de 7 dias ativo: arquivo "excluído" continua recuperável por 7 dias (vale mencionar na Política de retenção). |
| FB7 | Baixo | Regiões: Firestore em `southamerica-east1`, bucket em `US-EAST1` e Functions em `us-east1` (padrão do código). As funções de limpeza leem o banco em São Paulo a partir dos EUA (latência e tráfego entre regiões). |
| FB8 | Info | Regras do Firestore publicadas (2026-09-22) = repositório, exceto o bloco explícito de `oauthClients` (coberto pela negação padrão). Ou seja, **L1 está ativo em produção**. |
| FB9 | Info | Volume: 2 perfis em `users`, 2 workspaces, 859 páginas, 82 cadernos, 1 base, 5 flashcards, 1 versão, **579 documentos em `attachments`** (coleção que o app nunca lê — P6), 24 `import_jobs`, 18 `trashed_media`, 3 integrações com 2 tokens guardados, 1 `oauthClients`. |
| FB10 | Info | Faturamento ativo no projeto; domínios autorizados corretos (`synapsysnt.com.br`, `app.synapsysnt.com.br`, `localhost`, domínios Firebase). |

Não verificável com esta chave (403): funções implantadas e seus runtimes/timeouts,
jobs do Cloud Scheduler, backend do App Hosting (região, variáveis), segredos, logs
de erro, IAM e backups. Também não foi feita a checagem de consistência sobre o
conteúdo (páginas com `blocks` duplicado, arquivos órfãos, itens vencidos na
lixeira), que exige leitura em massa dos dados dos usuários.

---

## 2. Implementações para correção

Ordem sugerida: primeiro o que perde dados ou contradiz a Política, depois custo e
escala, por fim qualidade.

### Fase 1 — Perda de dados e conformidade (imediato)

**1. P1 — parar de gravar `blocks` em dobro** (`firestore-adapter.ts`, `updatePage`)

```ts
const { blocks: _raw, ...rest } = patch;
const payload: Record<string, unknown> = stripUndefined({
  ...rest,
  ...(blocks ? { blocksJson: JSON.stringify(blocks), blocks: deleteField() } : {}),
  updatedBy: this.userId,
  updatedAt: serverTimestamp(),
});
```

- `deleteField()` limpa o campo legado aos poucos; um script Admin único pode limpar o resto
  (`FieldValue.delete()` em `blocks` de todas as páginas e versões).
- Corrigir `hasUnsupportedFirestoreArrays`: o Firestore só proíbe array **diretamente**
  dentro de array; objeto com array dentro de array é permitido. (Com o item acima o
  campo `blocks` deixa de ser necessário, então a função pode sair.)
- Medir tamanho com o payload já sem duplicação e aplicar a mesma checagem em
  `createPage`, `snapshotVersion` e importações (P2).

**2. C1 — concorrência na edição de notas**

Curto prazo (otimista, por revisão):

- Campo `rev: number` na página; o editor guarda o `rev` da última versão aplicada.
- Salvar em `runTransaction`: ler, comparar `rev` com o `baseRev`; se igual, gravar
  `rev + 1`; se diferente, fazer *merge* de 3 vias por `block.id` (base = última
  versão confirmada, local = editor, remoto = servidor) e regravar; blocos alterados
  dos dois lados viram conflito visível (manter os dois e avisar).
- Liberar `rev` nas regras e exigir `incoming().rev == existing().rev + 1` no update
  de páginas.
- Observação: transação não funciona offline; manter o caminho atual como fallback
  offline e reconciliar ao voltar a rede.

Longo prazo: CRDT (Yjs + `y-prosemirror`) com log de atualizações em
`pages/{id}/updates` e compactação periódica.

**3. L1 — proteger campos de aceite** (`firestore.rules`)

```
match /users/{userId} {
  function serverOnly() { return ['legalAcceptedVersion', 'legalAcceptedAt']; }
  allow read: if isSignedIn() && request.auth.uid == userId;
  allow create: if isSignedIn() && request.auth.uid == userId
    && incoming().uid == userId
    && !incoming().keys().hasAny(serverOnly());
  allow update: if isSignedIn() && request.auth.uid == userId
    && incoming().uid == userId
    && !incoming().diff(existing()).affectedKeys().hasAny(serverOnly());
  allow delete: if false;
}
```

Melhor ainda: histórico imutável em `users/{uid}/legal_acceptances/{version}`
(somente Admin), com data do servidor, IP e user agent.

**4. L2 — reaceite obrigatório** (`registration-gate.tsx`)

Depois do `profileNeedsCompletion`, se `legalAcceptanceRequired(user, profile)`,
exibir um diálogo com checkbox e links para Termos/Política que chama
`recordLegalAcceptance(uid)` e recarrega o perfil. No cadastro, não engolir o erro
do aceite: mostrar aviso e deixar o gate pedir de novo.

**5. L3/L4 — provedores de IA e tradução**

- Usar a Gemini API só em projeto **com faturamento** (ou migrar para Vertex AI) e
  remover do `.env.example` a orientação de plano gratuito; citar a condição na Política.
- Trocar o endpoint `translate_a/single` pela **Cloud Translation API v3**
  (`projects/{id}/locations/global:translateText`) com a service account do projeto,
  ou retirar o recurso.

**6. L5/L6 — exclusão e exportação de conta**

- Exclusão: para cada workspace do usuário (consulta
  `where('memberIds', 'array-contains', uid)`), revogar tokens (Notion/Google/Evernote
  via `integration-disconnect.ts` e `evernote/store.ts`), depois
  `adminDb().recursiveDelete(wsRef)` (apaga todas as subcoleções, inclusive
  `integrations/*/secure`, `attachments`, `import_jobs/*/logs`), `bucket.deleteFiles`
  dos prefixos e `auth.deleteUser`.
- Exportação: ZIP com JSON por coleção + os arquivos do Storage + registros de acesso
  do titular.
- Oferecer as duas ações também no app (Preferências → "Baixar meus dados" /
  "Excluir conta", com reautenticação), mantendo o e-mail como canal alternativo.

**7. L7 — TTL dos registros de acesso**

```
gcloud firestore fields ttls update expiresAt \
  --collection-group=access_logs --enable-ttl --project=synapsysnote
```

Documentar em `docs/07-setup-e-deploy.md`.

**8. F6/F7 — exclusões de arquivos sem checagem**

- Remover a ação `purge_expired` de `/api/media/quarantine` (ou fazê-la chamar
  `purgeExpiredQuarantine`, que confere referências).
- Em `deleteMedia`, remover o `deleteObject` redundante do cliente; o servidor decide.
- Para mídia removida do editor e cards, preferir quarentena com checagem na limpeza.

**8b. FB1/FB2 — publicar regras e índices do repositório**

`npm run deploy:rules` (Firestore rules + indexes + Storage). Antes, aplicar a
correção X1 no `storage.rules` para publicar tudo de uma vez. Isso fecha a leitura
pública dos ícones e a leitura de avatares por terceiros, e aplica as exceções de
índice de `blocks`/`blocksJson`/`plainText`/`extractedOCRText`.

**8c. FB4 — recuperação de desastre**

Ativar PITR (`gcloud firestore databases update --enable-pitr`), proteção contra
exclusão (`--delete-protection`) e um agendamento de backup diário
(`gcloud firestore backups schedules create --recurrence=daily --retention=14d`).

**9. F1/F2/F3 — Functions**

- Alinhar região: criar `functions/.env` com `FUNCTIONS_REGION=<região>` e usar a mesma
  em `NEXT_PUBLIC_FIREBASE_REGION` (de preferência a do Firestore; para usuários no
  Brasil, `southamerica-east1`). Trocar de região exige apagar as funções antigas.
- `firebase.json`: `"runtime": "nodejs22"`; `functions/package.json`:
  `"engines": { "node": "22" }` e atualizar `firebase-functions`/`firebase-admin`.
- Nas agendadas: `timeoutSeconds: 1800`, `memory: "1GiB"`, `retryCount: 1`.

**10. L8 — cache local e logout**

- No ramo `hasLogoutIntent()` de `use-auth.tsx`, chamar `writeCachedUser(null)` e
  `clearSignedOutStorage()` (hoje só o logout pelo menu limpa).
- Usar `memoryLocalCache()` quando "Manter conectado" estiver desmarcado.
- Preferir `await terminate(db); await clearIndexedDbPersistence(db)` e zerar o
  singleton de `client.ts`, em vez de apagar bases por nome.
- Limpar também `synapsys.bootstrapped.*`, `synapsys.trash_purge_cooldown.*` e
  `synapsys.profile.v1.*`.
- Ajustar o texto da Política de Cookies ("cópia dos dados do workspace no
  IndexedDB, apagada ao sair").

### Fase 2 — Concorrência, custo e escala

**11. P3 — autosave mais barato**

- Desquarentenar só caminhos **novos**:
  `added = newPaths.filter((p) => !oldPaths.has(p))`.
- Usar como base o último snapshot recebido (o editor já o tem), sem `getDoc` a cada
  salvamento.

**12. S1 — separar metadados de conteúdo**

- Mover `blocksJson` para `pages/{id}/content/main` (regras iguais às da página).
- A barra lateral e a busca assinam só metadados (`title`, `icon`, `notebookId`,
  `parentPageId`, `path`, `order`, `tags`, `updatedAt`, `deletedAt` e um `plainText`
  truncado para busca); a nota aberta assina o próprio conteúdo.
- Usar `snap.docChanges()` para atualizar incrementalmente; aplicar debounce na escrita
  do cache do `localStorage`.

**13. S2/F3/F5/C4 — índice de mídia para a limpeza**

- Gravar em cada página/card/linha um campo `mediaPaths: string[]` (normalizado) no
  salvamento.
- Checagem "em uso" vira `where('mediaPaths', 'array-contains-any', lote de até 30)` →
  custo proporcional aos candidatos, não ao workspace. Fazer backfill com script Admin.
- Uma única implementação da limpeza (pacote compartilhado ou só nas Functions, com a
  rota Next apenas enfileirando).
- Agendada: `collectionGroup('pages').where('deletedAt', '<=', cutoff)` em páginas de
  500, ou fan-out por workspace via Cloud Tasks.
- Rechecar a referência imediatamente antes de apagar cada arquivo.

**14. C2/S4/P7 — importação do Notion robusta**

- Lease no job em transação (`leaseUntil`, `leaseOwner`); o step só roda se conseguir
  o lease e o libera ao final; itens marcados `processing` dentro da transação.
- Itens e `treeMetadata` em subcoleção (`import_jobs/{id}/items`, `…/tree`).
- Execução no servidor (Cloud Tasks ou trigger `onDocumentWritten` em Functions),
  sem depender da aba aberta; limpar jobs concluídos após N dias.

**15. C3 — revisão de flashcard em transação**

```ts
await runTransaction(getDb(), async (tx) => {
  const snap = await tx.get(targetRef);
  if (!snap.exists()) return;
  const result = calculateNextReview(snap.data() as Flashcard, rating, modifier);
  tx.update(targetRef, { ...result, lastReviewedAt: Date.now(), updatedAt: serverTimestamp() });
});
```

**16. P4/P5 — operações de árvore**

- `movePage` em lotes (como `commitWrites`) e checagem de ciclo também no adapter.
- Consultas direcionadas (`where('notebookId', 'in', ids)` em lotes de 30,
  `path array-contains`) em vez de `getDocs` da coleção inteira.
- Para exclusões grandes, rota no servidor com `BulkWriter` e marcador idempotente da
  operação.

**17. S3 — transcrição fora do servidor web**

Mover o Whisper para um serviço Cloud Run dedicado (concorrência 1, 2–4 GiB, modelo
embutido na imagem) ou remover o fallback. Separar rotas pesadas de IA do SSR
(backend próprio ou fila).

**18. C5 — rate limit por usuário**

Usar o `uid` do token já verificado como chave; para teto global, contador no
Firestore/Redis ou Cloud Armor na borda.

### Fase 3 — Segurança complementar

**19. X1 — Storage:** na regra genérica, `allow create, update: if pageId != 'icons' && …`.

**20. X2/FB5:** ativar a integração reCAPTCHA do Auth para e-mail/senha
(`emailPasswordEnforcementState: ENFORCE`, as chaves já existem no projeto) e o
**App Check** (reCAPTCHA Enterprise) para Firestore/Storage; definir política de
senha (mínimo 8, com verificação no cliente) e oferecer MFA; captcha também no cadastro.

**20b. FB6:** restringir o CORS do bucket a `https://synapsysnt.com.br` e
`https://app.synapsysnt.com.br` (`gsutil cors set`), e citar o *soft delete* de 7 dias
na seção de retenção da Política.

**21. X3:** em `members`, exigir `isOwner(workspaceId)` quando `incoming().role == 'owner'`
e impedir que um admin altere o próprio papel.

**22. X4:** `headers()` no `next.config.ts` com CSP, `frame-ancestors 'none'`, HSTS,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.

**23. X5:** opção "sair de todos os aparelhos" com `adminAuth().revokeRefreshTokens(uid)`
e `verifySessionCookie(cookie, true)` nas rotas que usam cookie.

**24. X6:** servir worker do pdf.js e CSS do KaTeX pelo bundler (mesma versão do pacote).

**25. L9:** para mídia privada, servir por rota autenticada (URL assinada de curta
duração) em vez de token permanente; ao menos revogar o token (`firebaseStorageDownloadTokens`)
quando o arquivo vai para a quarentena.

### Fase 4 — Qualidade e documentação

**26. Q1:** corrigir os 77 erros de lint (prioridade: `static-components` em `app-shell.tsx`,
`purity` em `trash/page.tsx`, `set-state-in-effect`) e tornar o lint obrigatório.

**27. Q2/Q3:** atualizar `verify-page-tree.mts` para a lixeira com `trashedWith`; tirar
`verify:firebase-admin` do `verify`; criar CI (GitHub Actions) com `typecheck`,
`functions:typecheck`, `lint`, `verify` e `build`.

**28. F4/Q4:** decidir OCR/embeddings (implementar e exportar, ou remover o código, o
índice vetorial do `firestore.indexes.json` e as menções); atualizar `docs/03`,
`docs/04`, `docs/08`.

**29. P6/P9/P10/P11/P12/L10/L11/L13:**

- Remover `attachments` (ou apagá-la na limpeza).
- Expor erro de assinatura sem apagar o cache.
- Incluir `updatedBy` no `purgeLegacyInbox`.
- Centralizar a constante de retenção.
- Remover a opção de workspace compartilhado ou implementar convites.
- Completar controlador/Encarregado.
- Mencionar logs de IP.
- Remover o código do login com GitHub (provedor desativado).
