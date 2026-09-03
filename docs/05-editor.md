# ETAPA 5 — Editor de blocos

Arquivos: [`src/components/editor/`](../src/components/editor/)

## 1. Formato de armazenamento vs. schema do editor

O que é persistido é `AppBlock[]`, não o JSON do TipTap.
[`serializer.ts`](../src/components/editor/serializer.ts) traduz nos dois
sentidos.

Motivo: `AppBlock[]` é também o alvo do conversor do Notion e a origem do texto
indexado. Se o formato de armazenamento fosse o schema do ProseMirror, a Cloud
Function precisaria instanciar um editor para gerar conteúdo, e trocar de editor
exigiria migrar todos os documentos.

A tradução resolve as diferenças estruturais: itens de lista consecutivos são
agrupados em um nó `bulletList`/`orderedList`/`taskList` na ida e desagrupados na
volta; anotações viram marks; menções viram nós `mention`.

## 2. Extensões

| Extensão | Arquivo | O que faz |
| --- | --- | --- |
| `SlashCommand` | [`slash-command.tsx`](../src/components/editor/extensions/slash-command.tsx) | palette de 16 comandos ancorada no cursor, filtrada por título e palavras-chave |
| `Mention` | [`mention-suggestion.tsx`](../src/components/editor/extensions/mention-suggestion.tsx) | `@` lista páginas e insere a menção que gera o backlink |
| `DragHandle` | [`drag-handle.ts`](../src/components/editor/extensions/drag-handle.ts) | alça lateral + botão “+”, plugin ProseMirror próprio |
| `Callout` | [`callout.tsx`](../src/components/editor/extensions/callout.tsx) | destaque com emoji clicável |
| `ToggleBlock` | [`toggle-block.tsx`](../src/components/editor/extensions/toggle-block.tsx) | conteúdo recolhível |
| `EquationBlock` | [`equation-block.tsx`](../src/components/editor/extensions/equation-block.tsx) | LaTeX renderizado com KaTeX, edição inline |
| `MediaBlock` | [`media-block.tsx`](../src/components/editor/extensions/media-block.tsx) | imagem/vídeo/áudio/arquivo + OCR e transcrição |
| `BubbleToolbar` | [`bubble-toolbar.tsx`](../src/components/editor/bubble-toolbar.tsx) | formatação flutuante sobre a seleção |

Sobre o **drag handle**: em vez de reimplementar arrastar e soltar, o plugin
monta uma `NodeSelection` no bloco sob o cursor e entrega a fatia para o
mecanismo nativo do ProseMirror (`view.dragging`). Assim posições de drop, undo e
mapeamento de posições continuam corretos de graça.

Sobre o **toggle**: o título fica em um atributo do nó, não no documento.
Recolher desmonta o corpo em vez de escondê-lo, o que evita conteúdo editável
invisível — armadilha clássica de `<details>` em editores.

## 3. Persistência

`onUpdate` → `docToBlocks` → `collectMentionIds` → `useDebounceAutoSave.schedule`.
Uma escrita por pausa de digitação, teto de 4 s, flush garantido ao sair.

O documento do TipTap é criado uma vez por `page.id`. Atualizações remotas da
*mesma* página não são forçadas de volta enquanto o usuário digita — isso brigaria
com o cursor. A exceção é o caso aditivo (upload de anexo ou nota de voz
adicionando um bloco ao fim), detectado por contagem de blocos.

`collectMentionIds` extrai os ids mencionados e grava em `outgoingLinks`; o
adaptador mantém `backlinks` como o inverso exato, que é o que a seção de
backlinks da página lê.

## 4. Comandos disponíveis (`/`)

**Básico** — texto, título 1, título 2, título 3
**Listas** — marcadores, numerada, tarefas, toggle
**Blocos** — callout, citação, código, equação (LaTeX), divisor
**Mídia** — imagem ou arquivo (dispara OCR), gravar nota de voz, anexar do computador

Os itens de mídia não manipulam o documento diretamente: eles chamam callbacks do
componente hospedeiro, porque o upload depende do adaptador de dados (Cloud
Storage), não do estado do editor.
