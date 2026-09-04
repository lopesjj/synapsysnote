# Firebase Console — copiar e colar

Projeto: **`synapsysnote`**
Console: https://console.firebase.google.com/project/synapsysnote

Os arquivos canônicos são [`firestore.rules`](../firestore.rules) e
[`storage.rules`](../storage.rules). O texto abaixo é o mesmo conteúdo, pronto
para colar no Console se você não tiver o CLI (`firebase deploy`).

## 1. Configuração do app Web

Já está no código (`src/lib/firebase/config.ts`) e no `.env.example`:

```js
const firebaseConfig = {
  apiKey: "AIzaSyCohAmoFuvjw-OXao3a_9yn0b-H22reprw",
  authDomain: "synapsysnote.firebaseapp.com",
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
   - **GitHub** (OAuth app no GitHub com callback `https://synapsysnote.firebaseapp.com/__/auth/handler`)
2. Settings → Authorized domains: `localhost`, `synapsysnote.firebaseapp.com`,
   e o domínio de produção (Vercel).
3. O app recusa OAuth de e-mails que ainda não existem no Auth (cadastro
   prévio obrigatório). E-mail/senha continua sendo o caminho de primeiro
   cadastro.

## 3. Firestore — cole em Database → Regras

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function memberPath(workspaceId) {
      return /databases/$(database)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid);
    }

    function isMember(workspaceId) {
      return isSignedIn() && exists(memberPath(workspaceId));
    }

    function role(workspaceId) {
      return get(memberPath(workspaceId)).data.role;
    }

    function canWrite(workspaceId) {
      return isMember(workspaceId) && role(workspaceId) in ['owner', 'admin', 'editor'];
    }

    function isAdmin(workspaceId) {
      return isMember(workspaceId) && role(workspaceId) in ['owner', 'admin'];
    }

    function isOwner(workspaceId) {
      return isMember(workspaceId) && role(workspaceId) == 'owner';
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function unchanged(field) {
      return !(field in incoming()) || incoming()[field] == existing()[field];
    }

    function hasNoServerFields() {
      return !incoming().keys().hasAny([
        'embedding', 'embeddingUpdatedAt', 'extractedOCRText', 'transcriptText'
      ]);
    }

    function hasNoProvenanceFields() {
      return (!('notionPageId' in incoming()) || incoming().notionPageId == null)
        && (!('importJobId' in incoming()) || incoming().importJobId == null);
    }

    function validImportSource() {
      return !('importSource' in incoming())
        || incoming().importSource == null
        || incoming().importSource == 'notion-zip';
    }

    function isPersonalWorkspace(workspaceId) {
      return workspaceId == 'ws_' + request.auth.uid;
    }

    match /users/{userId} {
      allow read: if isSignedIn() && request.auth.uid == userId;
      allow create, update: if isSignedIn()
        && request.auth.uid == userId
        && incoming().uid == userId;
      allow delete: if false;
    }

    match /workspaces/{workspaceId} {
      allow get: if isSignedIn() && (
        (
          isPersonalWorkspace(workspaceId)
          && !exists(/databases/$(database)/documents/workspaces/$(workspaceId))
        )
        || (
          exists(/databases/$(database)/documents/workspaces/$(workspaceId))
          && (
            request.auth.uid in resource.data.memberIds
            || request.auth.uid == resource.data.ownerId
            || isMember(workspaceId)
          )
        )
      );
      allow list: if isSignedIn() && request.auth.uid in resource.data.memberIds;

      allow create: if isSignedIn()
        && isPersonalWorkspace(workspaceId)
        && incoming().ownerId == request.auth.uid
        && incoming().memberIds is list
        && incoming().memberIds.size() == 1
        && incoming().memberIds[0] == request.auth.uid
        && incoming().name is string
        && incoming().name.size() > 0
        && incoming().name.size() <= 120;

      allow update: if isAdmin(workspaceId)
        && incoming().ownerId == existing().ownerId;

      allow delete: if isOwner(workspaceId);

      match /members/{userId} {
        allow read: if isMember(workspaceId)
          || (isSignedIn() && request.auth.uid == userId && isPersonalWorkspace(workspaceId));

        allow create: if isSignedIn() && (
          (
            request.auth.uid == userId
            && incoming().role == 'owner'
            && isPersonalWorkspace(workspaceId)
            && get(/databases/$(database)/documents/workspaces/$(workspaceId)).data.ownerId
              == request.auth.uid
          )
          || isAdmin(workspaceId)
        );

        allow update: if (
          isAdmin(workspaceId)
          && !(existing().role == 'owner' && incoming().role != 'owner')
        ) || (
          isSignedIn()
          && request.auth.uid == userId
          && isPersonalWorkspace(workspaceId)
          && incoming().role == existing().role
        );

        allow delete: if isAdmin(workspaceId) && existing().role != 'owner';
      }

      match /notebooks/{notebookId} {
        allow read: if isMember(workspaceId);
        allow create, update: if canWrite(workspaceId)
          && incoming().name is string
          && incoming().name.size() > 0
          && incoming().name.size() <= 200;
        allow delete: if canWrite(workspaceId);
      }

      match /pages/{pageId} {
        allow read: if isMember(workspaceId);

        allow create: if canWrite(workspaceId)
          && incoming().createdBy == request.auth.uid
          && incoming().title is string
          && incoming().title.size() <= 500
          && hasNoServerFields()
          && hasNoProvenanceFields()
          && validImportSource();

        allow update: if canWrite(workspaceId)
          && incoming().createdBy == existing().createdBy
          && incoming().updatedBy == request.auth.uid
          && unchanged('extractedOCRText')
          && unchanged('transcriptText')
          && unchanged('embedding')
          && unchanged('embeddingUpdatedAt')
          && unchanged('notionPageId')
          && unchanged('importJobId');

        allow delete: if isAdmin(workspaceId);

        match /versions/{versionId} {
          allow read: if isMember(workspaceId);
          allow create: if canWrite(workspaceId) && incoming().authorId == request.auth.uid;
          allow update: if false;
          allow delete: if isAdmin(workspaceId);
        }
      }

      match /databases/{databaseId} {
        allow read: if isMember(workspaceId);
        allow create, update: if canWrite(workspaceId)
          && incoming().name is string
          && incoming().name.size() > 0
          && incoming().name.size() <= 200;
        allow delete: if isAdmin(workspaceId);

        match /rows/{rowId} {
          allow read: if isMember(workspaceId);
          allow create, update, delete: if canWrite(workspaceId);
        }
      }

      match /attachments/{attachmentId} {
        allow read: if isMember(workspaceId);
        allow create: if canWrite(workspaceId)
          && incoming().uploadedBy == request.auth.uid
          && incoming().storagePath.matches('workspaces/' + workspaceId + '/.*');
        allow update: if canWrite(workspaceId)
          && unchanged('ocrText')
          && unchanged('transcript')
          && unchanged('embedding');
        allow delete: if canWrite(workspaceId);
      }

      match /import_jobs/{jobId} {
        allow read: if isMember(workspaceId);
        allow create: if false;

        allow update: if canWrite(workspaceId)
          && incoming().diff(existing()).affectedKeys().hasOnly(['status', 'updatedAt'])
          && incoming().status == 'canceled'
          && existing().status in ['pending', 'discovering', 'running'];

        allow delete: if isAdmin(workspaceId);

        match /logs/{logId} {
          allow read: if isMember(workspaceId);
          allow write: if false;
        }
      }

      match /integrations/{integrationId} {
        allow read: if isMember(workspaceId);
        allow write: if false;

        match /secure/{secretId} {
          allow read, write: if false;
        }
      }
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## 4. Storage — cole em Storage → Regras

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    function isSignedIn() {
      return request.auth != null;
    }

    function memberDoc(workspaceId) {
      return firestore.get(
        /databases/(default)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid)
      );
    }

    function isMember(workspaceId) {
      return isSignedIn()
        && firestore.exists(
          /databases/(default)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid)
        );
    }

    function canWrite(workspaceId) {
      return isMember(workspaceId)
        && memberDoc(workspaceId).data.role in ['owner', 'admin', 'editor'];
    }

    function withinSizeLimit(maxMb) {
      return request.resource.size < maxMb * 1024 * 1024;
    }

    function isAllowedUploadType() {
      return request.resource.contentType.matches('image/.*')
        || request.resource.contentType.matches('video/.*')
        || request.resource.contentType.matches('audio/.*')
        || request.resource.contentType.matches('text/.*')
        || request.resource.contentType in [
             'application/pdf',
             'application/json',
             'application/zip',
             'application/octet-stream',
             'application/msword',
             'application/vnd.ms-excel',
             'application/vnd.ms-powerpoint',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             'application/vnd.openxmlformats-officedocument.presentationml.presentation'
           ];
    }

    match /workspaces/{workspaceId}/uploads/{pageId}/{fileName} {
      allow read: if isMember(workspaceId);
      allow create, update: if canWrite(workspaceId)
        && withinSizeLimit(50)
        && isAllowedUploadType();
      allow delete: if canWrite(workspaceId);
    }

    match /workspaces/{workspaceId}/audio/{pageId}/{fileName} {
      allow read: if isMember(workspaceId);
      allow create, update: if canWrite(workspaceId)
        && withinSizeLimit(200)
        && (
          request.resource.contentType.matches('audio/.*')
          || request.resource.contentType == 'video/webm'
        );
      allow delete: if canWrite(workspaceId);
    }

    match /workspaces/{workspaceId}/notion/{jobId}/{fileName} {
      allow read: if isMember(workspaceId);
      allow write: if false;
    }

    match /workspaces/{workspaceId}/exports/{fileName} {
      allow read: if isMember(workspaceId);
      allow write: if false;
    }

    match /users/{userId}/{fileName} {
      allow read: if isSignedIn();
      allow create, update: if isSignedIn()
        && request.auth.uid == userId
        && withinSizeLimit(5)
        && request.resource.contentType.matches('image/.*');
      allow delete: if isSignedIn() && request.auth.uid == userId;
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## 5. O que as regras garantem

| Quem | Pode |
| --- | --- |
| Visitante anônimo | nada |
| Usuário autenticado | ler/escrever só `users/{seuUid}`; criar o workspace pessoal `ws_{uid}` |
| Membro `viewer` | ler o workspace e os arquivos |
| Membro `editor` / `admin` / `owner` | criar páginas, cadernos, anexos, importar `.zip` |
| Cliente | **não** cria job OAuth, **não** grava token Notion, **não** escreve OCR / embedding / `notionPageId` |
| Admin SDK (Functions / Next) | tudo — as regras não se aplicam |

## 6. Publicar pelo CLI (alternativa ao Console)

```bash
firebase login
firebase use synapsysnote
npm run deploy:rules
```
