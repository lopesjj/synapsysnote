<div align="center">
  <img src="public/brand/synapsys-note-logo.jpg" alt="Synapsys Note" width="320" />
  <p><strong>Conhecimento que se conecta.</strong></p>
</div>

Plataforma de produtividade e gestão de conhecimento (PKM) que combina a
flexibilidade de blocos e bases de dados do Notion com **backend 100% Firebase** e um **módulo nativo de
conexão e importação do Notion** (arquivos, páginas aninhadas e bases de dados).

---

## Índice

1. [O que já funciona](#o-que-já-funciona)
2. [Rodando em 30 segundos](#rodando-em-30-segundos)
3. [Arquitetura](#arquitetura)
4. [Documentação por etapa](#documentação-por-etapa)
5. [Estrutura de pastas](#estrutura-de-pastas)
6. [Setup completo (Firebase + Notion + IA)](#setup-completo)
7. [Deploy](#deploy)
8. [Decisões de projeto](#decisões-de-projeto)

---

## O que já funciona

| Área | Entregue |
| --- | --- |
| **Editor de blocos** | TipTap com barra de formatação, slash commands (`/`), bubble menu, localizar (`Ctrl/Cmd+F`), sumário de títulos, drag handles laterais, menções (`@`) com backlinks bidirecionais, callouts, toggles, código com realce e detecção de linguagem, cores e marca-texto, alinhamento e recuo de primeira linha, equações KaTeX, mídia embutida, autosave com debounce de 900 ms |
| **Importação do Notion** | Dois caminhos: **OAuth** (árvore selecionável, conversor recursivo, worker no servidor Next.js com progresso em tempo real) e **arquivo `.zip`** processado 100% no navegador com JSZip, gravado em lotes com `writeBatch`. Contêineres sem corpo viram **página/caderno**; folhas com texto viram **notas** |
| **Lista de notas** | Lista compacta, cartões e painel duplo estilo Evernote com prévia ao vivo, mais filtros por página/tag/favoritos, busca local e ordenação por modificação, criação ou título |
| **Bases de dados** | Visualizações Tabela e Kanban sobre os mesmos dados, edição inline, drag-and-drop de status |
| **Captura (Evernote-like)** | Gravação de voz com transcrição e resumo via Gemini, OCR automático de imagens e PDFs via Cloud Vision |
| **Busca** | Command Palette (`Cmd/Ctrl+K`) com busca híbrida: full-text local (funciona offline, inclui OCR e transcrições) + vetores via `findNearest` no Firestore |
| **Organização** | Páginas (cadernos-raiz) e cadernos aninhados, árvore infinita de notas, ícone e capa, duplicar com subárvore, reordenação por arrastar, tags globais, favoritos, histórico de versões, lixeira com retenção de 30 dias |
| **Interface** | Modo foco/Zen, barra lateral recolhível e redimensionável, menu da conta, trilho de navegação (voltar/avançar + migalhas), título da aba por rota, tema claro/escuro, 13 famílias tipográficas auto-hospedadas com corpo e largura de leitura ajustáveis |
| **Conta** | E-mail/senha e Google — o Google só entra com e-mails já cadastrados na autenticação. Perfil e preferências em `users/{uid}`, então o layout acompanha a conta entre dispositivos |
| **Infra** | Regras de segurança de Firestore e Storage, índices compostos e vetoriais, 12 Cloud Functions (OCR, IA, lixeira e fallback do Notion), persistência offline nativa |

### Vocabulário da árvore

O mesmo documento `notebooks/{id}` cobre dois papéis na interface:

| Na UI | No modelo | Rota |
| --- | --- | --- |
| **Página** | caderno-raiz (`parentId` nulo) | `/app/n/{id}` |
| **Caderno** | caderno aninhado | `/app/n/{id}` |
| **Nota** | documento `pages/{id}` | `/app/p/{id}` |

A importação do Notion usa a mesma regra: um item com filhos e sem corpo
substantivo vira página ou caderno; qualquer coisa com texto, mídia ou tabela
vira nota.

### Atalhos

| Atalho | Ação |
| --- | --- |
| `Cmd/Ctrl + K` | Busca global e comandos |
| `Cmd/Ctrl + N` | Nova nota |
| `Cmd/Ctrl + Shift + N` | Nova página (caderno-raiz) |
| `Cmd/Ctrl + B` | Recolher a barra lateral (`Cmd/Ctrl + \` funciona também dentro do editor, onde `B` é negrito) |
| `Cmd/Ctrl + Shift + F` | Modo foco / Zen (`Esc` sai) |
| `Cmd/Ctrl + ,` | Preferências |
| `Cmd/Ctrl + F` | Localizar na nota aberta |

### Modo demonstração local

**O app roda sem nenhuma credencial.** Se as variáveis `NEXT_PUBLIC_FIREBASE_*`
não estiverem definidas, a camada de dados troca o adaptador do Firestore por um
adaptador local (localStorage) que implementa exatamente o mesmo contrato
reativo — inclusive um worker simulado de importação do Notion, OCR e
transcrição. Isso existe para que o fluxo completo possa ser avaliado antes de
provisionar qualquer serviço; nenhum componente de UI sabe qual adaptador está
ativo.

---

## Rodando em 30 segundos

```bash
npm install
npm run dev          # http://localhost:43127
```

Na tela inicial, entre com e-mail ou Google. Sem credenciais Firebase, o
cadastro fica só neste navegador.

Para usar o backend real, copie `.env.example` para `.env.local` e preencha
(veja [Setup completo](#setup-completo)).

---

## Arquitetura

```
┌──────────────────────────── Navegador ─────────────────────────────┐
│  Next.js App Router (RSC + Client Components)                      │
│    Editor TipTap · Import Wizard · Command Palette · Kanban        │
│                              │                                     │
│                     DataAdapter (interface)                        │
│              ┌───────────────┴───────────────┐                     │
│      FirestoreAdapter                  LocalAdapter                │
│      (onSnapshot + cache offline)      (localStorage, demo)        │
└──────────────┬─────────────────────────────────────────────────────┘
               │ SDK Web (tempo real, offline-first)
               │ rotas /api/notion/* (Admin SDK, token só no servidor)
┌──────────────▼─────────────────────────────────────────────────────┐
│  Firebase                                                          │
│    Auth (Google, e-mail/senha)                                     │
│    Firestore  /workspaces/{id}/{pages,notebooks,databases,…}       │
│    Storage    workspaces/{id}/{uploads,notion,audio}/…             │
│    Functions  ── Vision OCR ─ Gemini ─ vetores ─ lixeira           │
│               (Notion: worker de 60 min como rede de segurança)    │
└──────────────┬─────────────────────────────────────────────────────┘
               │ tokens descriptografados só no servidor
        ┌──────▼───────┐   ┌─────────────┐   ┌──────────────────────┐
        │  Notion API  │   │ Cloud Vision│   │ Gemini / embeddings  │
        └──────────────┘   └─────────────┘   └──────────────────────┘
```

Regra central: **o navegador nunca vê um token de terceiro.** O callback OAuth
roda no servidor Next.js, criptografa o token com AES-256-GCM e grava em uma
subcoleção que as regras negam para qualquer cliente. Árvore, importação e
desconexão também passam por rotas `/api/notion/*` com o Admin SDK. As Cloud
Functions de Notion continuam no repo como rede de segurança para jobs longos
(até 60 minutos).

---

## Documentação por etapa

O roteiro pedido está detalhado em `docs/`:

| Etapa | Documento | Conteúdo |
| --- | --- | --- |
| 1 | [`docs/01-modelo-de-dados.md`](docs/01-modelo-de-dados.md) | Modelagem NoSQL completa, `firestore.rules`, `storage.rules`, índices |
| 2 | [`docs/02-arquitetura.md`](docs/02-arquitetura.md) | Árvore de arquivos, SDKs, camada de dados, hooks customizados |
| 3 | [`docs/03-importacao-notion.md`](docs/03-importacao-notion.md) | OAuth, conversor, classificação página/caderno/nota, worker |
| 4 | [`docs/04-midia-ocr-ia.md`](docs/04-midia-ocr-ia.md) | Cloud Vision, Gemini, embeddings e busca semântica |
| 5 | [`docs/05-editor.md`](docs/05-editor.md) | Extensões do TipTap, barra, localizar, serialização e autosave |
| 6 | [`docs/06-componentes-ui.md`](docs/06-componentes-ui.md) | Design system, wizard, sidebar, palette, cadernos, tabela e kanban |
| 7 | [`docs/07-setup-e-deploy.md`](docs/07-setup-e-deploy.md) | Passo a passo de configuração e deploy |
| 8 | [`docs/08-firebase-console.md`](docs/08-firebase-console.md) | `firebaseConfig` + regras de Firestore/Storage para copiar e colar |

---

## Estrutura de pastas

```
.
├── .firebaserc                  # projeto padrão: synapsysnote
├── firebase.json                # rules, indexes, functions, emuladores
├── firestore.rules              # ETAPA 1 — autorização por membro/role
├── firestore.indexes.json       # índices compostos + índice vetorial (768d)
├── storage.rules                # ETAPA 1 — uploads, áudio, ícones, mídia do Notion
├── .env.example                 # Web SDK do projeto synapsysnote já preenchido
├── docs/                        # roteiro técnico (etapas 1 a 8)
├── functions/                   # Cloud Functions (Node 20 + TypeScript)
│   └── src/
│       ├── index.ts             # exportação e opções globais
│       ├── lib/{firebase,crypto}.ts
│       ├── notion/              # pipeline OAuth (fallback de 60 min)
│       ├── ai/{ocr,transcribe,embeddings}.ts
│       └── maintenance/trash.ts # retenção de 30 dias
└── src/
    ├── app/
    │   ├── layout.tsx           # tema, providers, toaster
    │   ├── fonts.ts             # 13 famílias auto-hospedadas (next/font)
    │   ├── page.tsx             # landing + autenticação
    │   ├── api/notion/{authorize,callback,tree,import,disconnect}/
    │   ├── api/workspace/bootstrap/
    │   └── app/                 # workspace autenticado
    │       ├── layout.tsx       # AppShell
    │       ├── page.tsx         # início
    │       ├── notes/           # lista/cartões/painel duplo
    │       ├── n/[notebookId]/  # página ou caderno
    │       ├── p/[pageId]/      # nota (editor)
    │       ├── db/[databaseId]/ # tabela + kanban
    │       ├── tag/[tag]/
    │       ├── trash/
    │       └── integrations/
    ├── components/
    │   ├── editor/              # TipTap: barra, localizar, outline, extensões
    │   ├── notion/import-wizard.tsx
    │   ├── notes/               # explorador de notas + prévia read-only
    │   ├── database/            # tabela, kanban, células
    │   ├── layout/              # shell, sidebar, palette, menu, preferências
    │   ├── media/audio-recorder.tsx
    │   ├── page/{page-view,notebook-view,cover-picker,workspace-crumbs}.tsx
    │   └── ui/                  # primitivas + icon-picker
    ├── hooks/
    │   ├── use-auth.tsx
    │   ├── use-user-profile.ts
    │   ├── use-firestore-live-doc.ts
    │   ├── use-debounce-auto-save.ts
    │   ├── use-workspace-nav-history.ts
    │   └── use-notion-import.ts
    ├── lib/
    │   ├── firebase/{client,admin}.ts
    │   ├── data/{adapter,firestore-adapter,local-adapter,provider,
    │   │         page-tree,notebook-tree,duplicate,seed}.ts
    │   ├── store/{ui-store,nav-history}.ts
    │   ├── notion/{classify-import,server/}
    │   ├── icons/ · covers/ · code/ · typography.ts · search.ts
    │   └── document-title.ts
    └── types/models.ts
```

---

## Setup completo

### 1. Firebase

O projeto **`synapsysnote`** já está associado (`.firebaserc`) e o Web SDK
público já entra como fallback em `src/lib/firebase/config.ts`. Copie
`.env.example` → `.env.local` ou deixe o fallback.

```bash
npm install -g firebase-tools
firebase login
firebase use synapsysnote
```

No console (https://console.firebase.google.com/project/synapsysnote):

- **Authentication** → habilite *E-mail/senha* e *Google*.
- **Firestore** → crie o banco em modo produção e cole [`firestore.rules`](firestore.rules).
- **Storage** → crie o bucket `synapsysnote.firebasestorage.app` e cole [`storage.rules`](storage.rules).
- Texto pronto para colar: [`docs/08-firebase-console.md`](docs/08-firebase-console.md).
- **Contas de serviço** → gere a chave privada e cole o JSON em uma linha em
  `FIREBASE_SERVICE_ACCOUNT_JSON` (necessário para bootstrap, OAuth e importação
  do Notion no servidor Next.js).

Publique regras e índices:

```bash
npm run deploy:rules
```

### 2. Notion

1. Acesse <https://www.notion.so/my-integrations> → **New integration**.
2. Tipo **Public integration** (necessário para OAuth).
3. Redirect URI: `http://localhost:43127/api/notion/callback` (e a URL de
   produção equivalente).
4. Capabilities: *Read content* (e *Read user information* se quiser exibir o
   autor).
5. Copie **OAuth client ID** e **OAuth client secret** para `.env.local`.

Gere a chave de criptografia dos tokens:

```bash
openssl rand -base64 32     # cole em TOKEN_ENCRYPTION_KEY
```

### 3. IA e Cloud Functions

```bash
cd functions && npm install && cd ..

firebase functions:secrets:set TOKEN_ENCRYPTION_KEY   # mesmo valor do .env.local
firebase functions:secrets:set GEMINI_API_KEY         # https://aistudio.google.com/apikey

gcloud services enable vision.googleapis.com          # OCR
```

Para busca semântica, crie o índice vetorial (o `firestore.indexes.json` já o
declara; em projetos existentes pode ser necessário rodar):

```bash
gcloud firestore indexes composite create \
  --collection-group=pages --query-scope=COLLECTION \
  --field-config=field-path=deletedAt,order=ascending \
  --field-config=field-path=embedding,vector-config='{"dimension":768,"flat":{}}'
```

### 4. Emuladores (opcional, recomendado no dia a dia)

```bash
npm run emulators
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true npm run dev
```

---

## Deploy

**Frontend (Vercel):** conecte o repositório, defina as mesmas variáveis do
`.env.local` no painel e atualize `NOTION_REDIRECT_URI` para o domínio de
produção — o valor precisa ser idêntico ao cadastrado no Notion. A importação
OAuth roda nas rotas `/api/notion/*` (até 5 minutos por job no App Router);
jobs maiores ainda podem usar o worker das Functions.

**Backend:**

```bash
npm run deploy:rules        # firestore.rules + índices + storage.rules
npm run deploy:functions    # 12 Cloud Functions
```

Verificação pós-deploy:

```bash
firebase functions:log --only processNotionImportJob
```

---

## Verificação

```bash
npm run typecheck
npm run lint
npm run verify        # checagens de lógica, sem navegador
```

`npm run verify` cobre as partes cuja lógica é difícil de confiar só ao
teste manual:

| Script | O que garante |
| --- | --- |
| `verify:sidebar-dnd` | Resolução de cada tipo de drop na barra lateral, inclusive aninhar um caderno e a recusa de mover uma página para dentro da própria subárvore |
| `verify:page-tree` | Roda o `LocalAdapter` de verdade e confere que mover uma nota leva a subárvore inteira, com `path` e `notebookId` reescritos |
| `verify:notebook-tree` | Ancestrais, descendentes e `parentId` ausente tratado como raiz — cadernos aninhados sem ciclo |
| `verify:media-enrichment` | Autosave não apaga transcrição/OCR que chegou com o bloco ainda `pending` |

---

## Decisões de projeto

**Por que uma interface `DataAdapter` em vez de chamar o Firestore direto nos
componentes.** O mesmo contrato serve à produção (onSnapshot, cache offline) e à
demonstração sem credenciais. Como consequência, nenhuma tela precisa de código
condicional, e trocar o backend um dia é reescrever um arquivo.

**Por que a importação OAuth passa pelo Next.js.** Árvore, enfileiramento e
worker cabem nas rotas `/api/notion/*` com o Admin SDK — o mesmo runtime que
já troca o token. O gatilho `processNotionImportJob` nas Functions permanece
como rede de segurança: importar milhares de páginas pode passar dos 5 minutos
do App Router, e o worker de documento aceita até 60 minutos.

**Por que rehospedar as mídias do Notion.** A API do Notion devolve URLs
presigned do S3 que expiram em cerca de uma hora. Guardá-las significaria uma
base inteira de imagens quebradas no dia seguinte. O servidor baixa cada
arquivo por streaming — memória constante mesmo em vídeos de centenas de MB — e
reescreve o bloco com o link permanente do Cloud Storage.

**Por que o progresso mora num documento, não na resposta HTTP.** O cliente
cria `/workspaces/{id}/import_jobs/{jobId}` e volta imediatamente; o worker
atualiza o mesmo documento a cada item, que é exatamente o que o listener do
wizard renderiza. Fechar o modal não cancela nada.

**Por que `extractedOCRText`, `transcriptText` e `embedding` são campos
server-only.** As regras rejeitam qualquer escrita do cliente nesses campos. Eles
alimentam a busca; se fossem graváveis pelo navegador, um cliente comprometido
poderia envenenar o índice de todo o workspace.

**Por que existem dois caminhos de importação do Notion.** O caminho por OAuth é
o completo — cada usuário Synapsys autoriza a **própria** conta Notion, o token
fica no workspace `ws_{uid}`, e o worker lê bases com seus tipos de propriedade.
A integração pública precisa de escopo **Any workspace**; do contrário só o
workspace do desenvolvedor consegue instalar. O caminho por `.zip` cobre quem já
tem um export e não quer conectar a conta: o navegador descompacta, converte e
grava. O custo é que o export em Markdown perde os tipos das propriedades das
bases (viram uma tabela) e a proveniência não pode usar `notionPageId`, campo
reservado ao Admin SDK pelas regras.

**Por que um item do Notion vira página, caderno ou nota.** Um contêiner com
filhos e sem corpo substantivo é só estrutura — vira página (raiz) ou caderno
(aninhado). Uma folha, ou qualquer coisa com texto/mídia, é nota. Assim a
sidebar não enche de “notas vazias” que no Notion eram só pastas.

**Por que mover uma nota reescreve a subárvore inteira.** `path` e `notebookId`
são dados derivados, mantidos desnormalizados para que ler uma subárvore seja
uma consulta e não uma travessia. A árvore da barra lateral agrupa por
`notebookId` e `parentPageId`, então um descendente deixado no caderno antigo se
desprende do pai — a subárvore parece ter desaparecido do caderno de destino. As
duas implementações de `movePage` reescrevem todos os descendentes; no Firestore,
em um único lote, com uma consulta `array-contains` sobre `path`.

**Por que a decisão do drop mora fora do componente.** Automatizar arrastar no
navegador é pouco confiável — um teste que falha não distingue lógica errada de
gesto mal sintetizado. `sidebar-dnd.ts` não importa nada do dnd-kit e responde
só a “dado o que foi arrastado e onde soltou, o que muda?”, o que é verificável
em Node. O componente apenas aplica o plano.

**Por que o formato de bloco é próprio, e não o JSON do TipTap.** `AppBlock[]` é
o alvo da conversão do Notion, a fonte do texto indexado e o que o editor
serializa. Manter o formato de armazenamento independente do schema do editor
permite trocar de editor sem migrar dados — e permite que o worker de importação
produza conteúdo sem instanciar um ProseMirror.
