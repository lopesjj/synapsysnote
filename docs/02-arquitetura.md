# ETAPA 2 — Arquitetura de pastas, SDKs e hooks

## 1. Camada de dados

O ponto central da arquitetura do cliente é
[`src/lib/data/adapter.ts`](../src/lib/data/adapter.ts): uma interface que
descreve tudo que a UI pode fazer com dados. Duas implementações a satisfazem.

| | `FirestoreAdapter` | `LocalAdapter` |
| --- | --- | --- |
| Leituras | `onSnapshot` com `includeMetadataChanges` | pub/sub em memória |
| Persistência | Firestore + cache offline IndexedDB | `localStorage` |
| Importação do Notion | `/api/notion/*` (Admin SDK) → job em background | worker simulado no browser |
| OCR / transcrição | Cloud Functions | simulados com atraso realista |
| Quando é usado | há credenciais e usuário autenticado | qualquer outro caso |

`WorkspaceProvider` ([`provider.tsx`](../src/lib/data/provider.tsx)) escolhe o
adaptador, assina todas as coleções e expõe estado derivado: árvore de notas,
árvore de cadernos, lixeira, tags globais, job de importação ativo. Componentes
chamam `useWorkspace()` e nunca sabem qual backend responde.

A hierarquia de cadernos (`parentId`) mora em
[`notebook-tree.ts`](../src/lib/data/notebook-tree.ts); a de notas, em
[`page-tree.ts`](../src/lib/data/page-tree.ts). Duplicar página/caderno
([`duplicate.ts`](../src/lib/data/duplicate.ts)) é um helper puro que os dois
adaptadores chamam.

Consequência prática: a suíte de telas é testável e demonstrável sem Firebase, e
a lógica de UI não tem ramificações de ambiente.

### Onde cada tipo de estado vive

Três camadas, com fronteiras deliberadas:

| Camada | Responsável | Por quê |
| --- | --- | --- |
| Documentos em tempo real | `WorkspaceProvider` + `DataAdapter` (`onSnapshot`) | Um canal *push* já entrega os dados mais frescos do que qualquer cache com revalidação conseguiria |
| Leituras sob demanda | **TanStack Query** ([`query-provider.tsx`](../src/lib/query/query-provider.tsx)) | Histórico de versões, árvore do Notion e perfil são buscados por ação explícita do usuário; aí cache, `retry` e invalidação valem a pena |
| Estado de interface | **Zustand** ([`ui-store.ts`](../src/lib/store/ui-store.ts), [`nav-history.ts`](../src/lib/store/nav-history.ts)) | Geometria da barra lateral, modo foco, layout da lista, tipografia e o trilho voltar/avançar da sessão |

O slice durável do Zustand é persistido em `localStorage` e espelhado em
`users/{uid}.preferences` por [`use-user-profile.ts`](../src/hooks/use-user-profile.ts),
então trocar de dispositivo preserva o layout. A reidratação é adiada para
depois da montagem (`skipHydration`) porque um layout persistido divergindo do
HTML pré-renderizado quebraria a hidratação do React.

## 2. SDK do Firebase

**Cliente** ([`lib/firebase/client.ts`](../src/lib/firebase/client.ts)) —
inicialização preguiçosa, `isFirebaseConfigured()` como guarda, e Firestore
criado com `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.
Isso entrega o requisito de persistência offline nativa e mantém várias abas
coerentes. Se o IndexedDB não estiver disponível, cai para `memoryLocalCache`
em vez de quebrar. `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` conecta os quatro
emuladores.

**Admin** ([`lib/firebase/admin.ts`](../src/lib/firebase/admin.ts)) — marcado com
`server-only`. Resolve credenciais em três níveis: JSON inline (ideal para
Vercel), caminho de arquivo, ou Application Default Credentials. Usado pelas
rotas `/api/workspace/bootstrap` e `/api/notion/{authorize,callback,tree,import,disconnect}`,
que precisam escrever em caminhos fechados às regras do cliente.

## 3. Hooks customizados

### `useFirestoreLiveDoc`
[`src/hooks/use-firestore-live-doc.ts`](../src/hooks/use-firestore-live-doc.ts)

Envelope de `onSnapshot` para um documento que também devolve
`fromCache` e `hasPendingWrites`. É o que permite ao cabeçalho do editor
distinguir "Salvo", "Sincronizando" e "Offline — será sincronizado" sem
heurística.

### `useDebounceAutoSave`
[`src/hooks/use-debounce-auto-save.ts`](../src/hooks/use-debounce-auto-save.ts)

Agrupa digitação em uma escrita (900 ms de ociosidade) com teto de 6 s para quem
digita sem parar, serializa flushes sobrepostos, tenta de novo com backoff e
faz *flush* em `visibilitychange`, `beforeunload` e desmontagem. `resetKey`
(o id da nota) garante que navegar de A para B nunca grave A em B. Expõe uma
máquina de estados (`idle → dirty → saving → saved → error`) que o indicador
de status consome diretamente.

### `useNotionImport`
[`src/hooks/use-notion-import.ts`](../src/hooks/use-notion-import.ts)

Estado completo do wizard: carregar a árvore, seleção com propagação
pai→filhos, estado tri-state de checkbox (`checked | unchecked | indeterminate`),
resumo do que será importado, criação do job e leitura do progresso ao vivo. A
ordem de envio é *depth-first* — pais antes de filhos — para que
`parentPageId` sempre resolva no worker.

### `useAuth`
[`src/hooks/use-auth.tsx`](../src/hooks/use-auth.tsx)

Google e e-mail/senha via Firebase Auth. O Google só entra com e-mail já
cadastrado. Os módulos de `firebase/auth` são importados dinamicamente para não
entrarem no bundle inicial.

### `useWorkspaceNavHistory`
[`src/hooks/use-workspace-nav-history.ts`](../src/hooks/use-workspace-nav-history.ts)

Mantém um trilho em memória das rotas `/app/*` para as setas voltar/avançar do
cabeçalho ([`nav-history.ts`](../src/lib/store/nav-history.ts)). Não usa
`history.back()` do navegador — a história da sessão mistura landing, OAuth e
o workspace, e o usuário espera só as notas e cadernos que abriu.

## 4. Renderização

Server Components cuidam do shell (`layout.tsx`, metadata, fontes). Tudo que
depende de estado reativo do Firestore é Client Component — não faz sentido
renderizar no servidor um documento que chega por listener no instante seguinte.

O tema é aplicado por um script inline antes da primeira pintura
([`theme-provider.tsx`](../src/components/theme-provider.tsx)), então não existe
flash de canvas claro no modo escuro. O título da aba
([`document-title.tsx`](../src/components/layout/document-title.tsx)) acompanha
a rota (`Synapsys Note | …`) e resiste ao `<title>` que o App Router recoloca
em cada navegação.
