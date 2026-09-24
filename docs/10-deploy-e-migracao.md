# Deploy e migração — correções da auditoria (setembro/2026)

Ordem pensada para que nada quebre no meio do caminho: o app publicado hoje
continua funcionando a cada passo. Rode tudo a partir da raiz do repositório,
logado no projeto (`firebase login`, `firebase use synapsysnote`,
`gcloud config set project synapsysnote`).

## 1. Regras, índices e TTL (compatíveis com o app atual)

```bash
npm run deploy:rules
```

Publica `firestore.rules`, `storage.rules` e `firestore.indexes.json`:

- fecha a leitura pública dos ícones (`uploads/icons`) e a leitura de avatares por
  outros usuários, que estão abertas nas regras publicadas hoje;
- campos de aceite dos Termos só pelo servidor; papel de dono só pelo dono;
- exceções de índice para o conteúdo das notas e índices de grupo de `deletedAt`,
  `expiresAt` e `versions.createdAt` (a função de limpeza depende deles);
- TTL em `access_logs.expiresAt` (6 meses do Marco Civil).

O CLI pode perguntar se deve apagar índices que existem no console e não no
arquivo: hoje não há nenhum, então pode confirmar.

## 2. Recuperação de desastre

```bash
gcloud firestore databases update --database='(default)' --enable-pitr --delete-protection
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d
```

## 3. Storage

```bash
gcloud storage buckets update gs://synapsysnote.firebasestorage.app --cors-file=storage-cors.json
```

## 4. Cloud Functions (Node 22, southamerica-east1)

```bash
npm --prefix functions ci
npm run deploy:functions
```

O `predeploy` do `firebase.json` copia o núcleo de limpeza de `src/lib/trash/` para
`functions/src/shared/` e compila; a função diária passa a apagar também as versões
de nota com mais de 30 dias (o histórico já dizia "30 dias").

As funções mudam de `us-east1` para `southamerica-east1`: o CLI cria as novas e
pergunta se apaga as antigas — confirme. O código novo do app chama a callable em
`southamerica-east1` (`NEXT_PUBLIC_FIREBASE_REGION` no `apphosting.yaml`).

## 5. APIs e permissões

```bash
gcloud services enable translate.googleapis.com
gcloud projects add-iam-policy-binding synapsysnote \
  --member="serviceAccount:<conta de serviço usada em FIREBASE_SERVICE_ACCOUNT_JSON>" \
  --role="roles/cloudtranslate.user"
```

Confirme no Google AI Studio que a `GEMINI_API_KEY` pertence a um projeto com
faturamento ativo. Enquanto a Cloud Translation não estiver ativa, a tradução usa a
Gemini API.

## 6. App (App Hosting)

```bash
npm run deploy:web
```

## 7. Migração de dados (depois do passo 6)

```bash
npm run migrate:2026-09              # simulação: só conta
npm run migrate:2026-09 -- --confirm # aplica
```

- remove o campo `blocks` duplicado das páginas e versões (o conteúdo fica em
  `blocksJson`, que já é o que o app lê);
- apaga os documentos da coleção `attachments`, que o app não usa mais;
- move a árvore dos jobs de importação em andamento para `import_jobs/{id}/meta/tree`;
- troca, nas notas importadas do Notion, as menções que ficaram com o id do Notion
  pelo id da nota no app e recalcula `outgoingLinks` (os backlinks dependem disso).

Rode depois do deploy do app para que nenhuma aba com a versão antiga volte a gravar
o campo `blocks`. Se isso acontecer, rodar a migração de novo resolve.

## 8. Autenticação (depois do passo 6)

No console, Authentication → Settings:

1. **Password policy**: mínimo de 8 caracteres, modo *Require*. O app novo já valida 8;
   a versão antiga validava 6, por isso este passo vem depois do deploy.
2. **reCAPTCHA** para e-mail/senha: ative em modo *Audit*, acompanhe as métricas por
   alguns dias e passe para *Enforce*.
3. **App Check** (opcional): registre o app web com reCAPTCHA Enterprise, coloque a
   chave em `NEXT_PUBLIC_APPCHECK_SITE_KEY` no `apphosting.yaml`, publique o app e,
   depois de alguns dias em monitoramento, exija o App Check no Firestore e no Storage.

## 9. Conferência

```bash
firebase functions:list                       # 3 funções em southamerica-east1, nodejs22
gcloud firestore fields ttls list             # access_logs.expiresAt ativo
gcloud firestore databases describe --database='(default)'  # PITR e deleteProtection
```

Pendente por decisão: identificação do controlador (razão social/CNPJ) e do
Encarregado nos documentos legais, quando houver empresa constituída.
