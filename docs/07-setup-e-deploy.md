# ETAPA 7 — Setup e deploy

## 1. Pré-requisitos

- Node.js 20+ (o app usa 22 localmente; as Functions rodam em 20)
- `firebase-tools` (`npm i -g firebase-tools`)
- Projeto no Firebase com faturamento Blaze — necessário para Cloud Functions de
  2ª geração, Cloud Vision e chamadas externas (a API do Notion)
- Conta no Notion com permissão para criar integrações

## 2. Instalação

```bash
npm install
cd functions && npm install && cd ..
cp .env.example .env.local
```

Sem preencher nada, `npm run dev` já sobe o app em modo demonstração local.

## 3. Firebase

Projeto já associado neste repo: **`synapsysnote`** (`.firebaserc`).

```bash
firebase login
firebase use synapsysnote
```

O Web SDK público já está em `.env.example` e em `src/lib/firebase/config.ts`.
Copie `.env.example` → `.env.local` (ou deixe o fallback do código). Sem
`FIREBASE_SERVICE_ACCOUNT_JSON` o app ainda sobe: o bootstrap do workspace
pessoal `ws_{uid}` é permitido pelas regras.

No console (https://console.firebase.google.com/project/synapsysnote):

| Serviço | Ação |
| --- | --- |
| Authentication | habilite **E-mail/senha**, **Google** e **GitHub**. Em *Authorized domains* deixe `localhost` e, em produção, o domínio da Vercel |
| Firestore | crie o banco em **modo produção** (região `nam5` / `us-central` de preferência) |
| Storage | crie o bucket padrão `synapsysnote.firebasestorage.app` |
| Regras | cole [`firestore.rules`](../firestore.rules) e [`storage.rules`](../storage.rules) — ver [guia de copiar e colar](08-firebase-console.md) |
| Contas de serviço | gere a chave privada; cole o JSON em uma linha em `FIREBASE_SERVICE_ACCOUNT_JSON` (só necessário para Notion OAuth / Admin) |

Publique regras e índices:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
# equivalente: npm run deploy:rules
```

### Workspace inicial

Por padrão o app **não** usa um workspace compartilhado `primary`. Cada conta
ganha `ws_{uid}` na primeira sessão (via `/api/workspace/bootstrap` ou, se o
Admin não estiver configurado, via `setDoc` no cliente — as regras permitem).

Só defina `NEXT_PUBLIC_DEFAULT_WORKSPACE_ID` se quiser um workspace compartilhado
entre contas; nesse caso crie o documento com o Admin SDK:

```js
// Console do Firestore ou script com o Admin SDK
/workspaces/<id-fixo>
  { name: "Meu workspace", ownerId: "<uid>", memberIds: ["<uid>"], plan: "free" }

/workspaces/<id-fixo>/members/<uid>
  { userId: "<uid>", email: "…", displayName: "…", role: "owner", joinedAt: <ts> }
```

## 4. Notion Integration Dashboard

1. <https://www.notion.so/my-integrations> → **New integration**
2. **Type:** Public integration (obrigatório para OAuth)
3. **Redirect URIs:**
   - `http://localhost:43127/api/notion/callback`
   - `https://SEU-DOMINIO/api/notion/callback`
4. **Capabilities:** Read content (opcionalmente Read user information)
5. Copie **OAuth client ID** e **OAuth client secret**

```bash
# .env.local
NOTION_CLIENT_ID=...
NOTION_CLIENT_SECRET=...
NOTION_REDIRECT_URI=http://localhost:43127/api/notion/callback
TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

> Durante a autorização, o usuário escolhe **quais páginas** compartilhar. A
> integração só enxerga o que foi explicitamente selecionado — se algo não
> aparece no wizard, é isso.

## 5. Segredos das Cloud Functions

```bash
firebase functions:secrets:set TOKEN_ENCRYPTION_KEY   # MESMO valor do .env.local
firebase functions:secrets:set GEMINI_API_KEY         # https://aistudio.google.com/apikey

gcloud services enable vision.googleapis.com
```

Se `TOKEN_ENCRYPTION_KEY` divergir entre o Next.js e as Functions, o worker não
consegue descriptografar o token e o job falha com
`failed-precondition: stored Notion token is missing`.

## 6. Desenvolvimento com emuladores

```bash
npm run emulators
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true npm run dev
```

Interface dos emuladores em <http://localhost:4000>. Auth, Firestore, Functions e
Storage rodam localmente; Vision e Gemini continuam remotos (precisam de chave).

## 7. Deploy

**Frontend — Vercel**

1. Importe o repositório.
2. Defina as variáveis de `.env.local` no painel do projeto.
3. Ajuste `NOTION_REDIRECT_URI` para o domínio de produção e cadastre a mesma URL
   no Notion.

**Backend**

```bash
npm run deploy:rules
npm run deploy:functions
```

## 8. Verificação

```bash
# regras
firebase deploy --only firestore:rules --dry-run

# funções
firebase functions:list
firebase functions:log --only processNotionImportJob

# app
npm run typecheck && npm run functions:typecheck && npm run build
```

## 9. Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Banner "Modo demonstração local" persiste | `NEXT_PUBLIC_FIREBASE_*` ausente ou build sem reiniciar |
| `redirect_uri_mismatch` no Notion | a URI no `.env` difere da cadastrada, inclusive por barra final |
| Job trava em `discovering` | segredo `TOKEN_ENCRYPTION_KEY` diferente entre runtimes |
| Imagens importadas não carregam | `downloadMedia` desligado no wizard — as URLs presigned expiraram |
| Busca semântica vazia | índice vetorial ainda em construção, ou `GEMINI_API_KEY` ausente |
| `permission-denied` ao criar página | falta o documento em `/workspaces/{id}/members/{uid}` |
