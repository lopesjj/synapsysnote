# Firebase Console

Projeto: **`synapsysnote`**
Console: https://console.firebase.google.com/project/synapsysnote

Configurações que ficam no Console. As regras e os índices são publicados pelo
CLI a partir dos arquivos do repositório (seção 3).

## 1. Configuração do app Web

Já está no código (`src/lib/firebase/config.ts`) e no `.env.example`:

```js
const firebaseConfig = {
  apiKey: "AIzaSyCohAmoFuvjw-OXao3a_9yn0b-H22reprw",
  authDomain: "synapsysnt.com.br",
  projectId: "synapsysnote",
  storageBucket: "synapsysnote.firebasestorage.app",
  messagingSenderId: "391599702512",
  appId: "1:391599702512:web:f1948d41d3f63ad340dd35",
  measurementId: "G-2ED1GY38CC",
};
```

Essas chaves são públicas por desenho. Quem protege o projeto são as regras
abaixo + os provedores de Auth + *Authorized domains*.

## 2. Authentication

1. Authentication → Sign-in method → habilite:
   - **E-mail/senha**
   - **Google**
2. Settings → Authorized domains: `localhost`, `synapsysnote.firebaseapp.com`,
   `synapsysnt.com.br` e `app.synapsysnt.com.br`.
3. Settings → Password policy: mínimo de 8 caracteres (o app já valida 8).
4. reCAPTCHA Enterprise para e-mail/senha: comece em modo de auditoria e passe
   para aplicação depois de conferir as métricas.
5. O app recusa OAuth de e-mails que ainda não existem no Auth (cadastro
   prévio obrigatório). E-mail/senha continua sendo o caminho de primeiro
   cadastro.

## 3. Regras do Firestore e do Storage

Os arquivos canônicos são [`firestore.rules`](../firestore.rules),
[`storage.rules`](../storage.rules) e [`firestore.indexes.json`](../firestore.indexes.json).
Publique sempre pelo CLI (`npm run deploy:rules`): uma cópia colada à mão no Console
envelhece e já causou divergência (faltavam `flashcards` e `trashed_media`).

Se precisar colar no Console, copie o conteúdo atual dos arquivos acima, não de um
documento.

## 4. O que as regras garantem

| Quem | Pode |
| --- | --- |
| Visitante anônimo | nada |
| Usuário autenticado | ler/escrever só `users/{seuUid}` (sem os campos de aceite dos Termos, gravados só pelo servidor); criar o workspace pessoal `ws_{uid}` |
| Membro `viewer` | ler o workspace e os arquivos |
| Membro `editor` / `admin` / `owner` | criar notas, páginas, cadernos, ícones, anexos e flashcards; importar arquivos no navegador |
| Cliente | **não** cria job OAuth, **não** grava token de integração, **não** escreve OCR / transcrição do servidor / `notionPageId`, **não** mexe na quarentena, **não** concede o papel de dono |
| Admin SDK (Functions / Next) | tudo — as regras não se aplicam |

## 5. Publicar pelo CLI

```bash
firebase login
firebase use synapsysnote
npm run deploy:rules
```
