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
pessoal `ws_{uid}` é permitido pelas regras. A importação OAuth do Notion,
porém, precisa do Admin SDK — árvore, job e desconexão passam por
`/api/notion/*`.

No console (https://console.firebase.google.com/project/synapsysnote):

| Serviço | Ação |
| --- | --- |
| Authentication | habilite **E-mail/senha** e **Google**. Em *Authorized domains* deixe `localhost` e, em produção, o domínio da Vercel |
| Firestore | crie o banco em **modo produção** (região `nam5` / `us-central` de preferência) |
| Storage | crie o bucket padrão `synapsysnote.firebasestorage.app` |
| Regras | cole [`firestore.rules`](../firestore.rules) e [`storage.rules`](../storage.rules) — ver [guia de copiar e colar](08-firebase-console.md) |
| Contas de serviço | gere a chave privada; cole o JSON em uma linha em `FIREBASE_SERVICE_ACCOUNT_JSON` (bootstrap, OAuth e importação do Notion no Next.js) |

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

Cada usuário do Synapsys conecta **a própria conta Notion**. O `CLIENT_ID` /
`CLIENT_SECRET` identificam o *app*; o token de importação é um por pessoa.

1. <https://www.notion.so/profile/integrations> → **Public connections** → **Create new connection**
2. **Installation scope:** **Any workspace** — obrigatório. *Selected workspaces only*
   só deixa instalar nos espaços do desenvolvedor (a conta de outra pessoa falha
   com “esta conexão não pode ser instalada”). Esse escopo **não muda** depois:
   se a conexão atual for restrita, crie outra.
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

## 5. Segredos (App Hosting)

```bash
firebase apphosting:secrets:set TOKEN_ENCRYPTION_KEY           # openssl rand -base64 32
firebase apphosting:secrets:set GEMINI_API_KEY                 # chave de projeto COM faturamento
firebase apphosting:secrets:set NOTION_CLIENT_SECRET
firebase apphosting:secrets:set RECAPTCHA_SECRET_KEY
npm run deploy:secrets:admin                                   # FIREBASE_SERVICE_ACCOUNT_JSON
```

As Cloud Functions atuais (limpeza da lixeira) não usam segredos.

A tradução usa a Cloud Translation API: ative `translate.googleapis.com` no projeto e
dê à conta de serviço do app o papel "Cloud Translation API User". Enquanto isso não
for feito, a rota usa a Gemini API.

## 6. Desenvolvimento com emuladores

```bash
npm run emulators
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true npm run dev
```

Interface dos emuladores em <http://localhost:4000>. Auth, Firestore, Functions e
Storage rodam localmente; Gemini continua remoto (precisa de chave).

## 7. Deploy

A ordem completa, com as configurações do console e a migração de dados, está em
[`10-deploy-e-migracao.md`](10-deploy-e-migracao.md).

```bash
npm run deploy:rules        # regras do Firestore e do Storage + índices e TTL
npm run deploy:functions    # Node 22, southamerica-east1
npm run deploy:web          # App Hosting (backend synapsysnote)
```

## 8. Verificação

```bash
npm run typecheck && npm run functions:typecheck && npm run lint && npm run verify && npm run build
firebase functions:list
firebase functions:log --only purgeExpiredTrash
```

O CI (`.github/workflows/ci.yml`) roda a mesma sequência em cada pull request.
`npm run check:firebase-admin` testa a credencial do Admin SDK localmente (fica fora
do `verify` porque exige a chave).

## 9. Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Banner "Modo demonstração local" persiste | `NEXT_PUBLIC_FIREBASE_*` ausente ou build sem reiniciar |
| `redirect_uri_mismatch` no Notion | a URI no `.env` difere da cadastrada, inclusive por barra final |
| Job do Notion falha em "autenticação" | `TOKEN_ENCRYPTION_KEY` trocado depois da conexão; reconecte a integração |
| Imagens importadas não carregam | `downloadMedia` desligado no wizard — as URLs presigned expiraram |
| `permission-denied` ao criar página | falta o documento em `/workspaces/{id}/members/{uid}` |
| Wizard não carrega a árvore do Notion | `FIREBASE_SERVICE_ACCOUNT_JSON` ausente ou `TOKEN_ENCRYPTION_KEY` divergente |
| Limpeza da lixeira não roda | functions não publicadas em `southamerica-east1` ou índice de grupo de `deletedAt` ainda em construção |
