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
| `SlashCommand` | [`slash-command.tsx`](../src/components/editor/extensions/slash-command.tsx) | palette de 17 comandos ancorada no cursor (Tippy + CSS), filtrada por título e palavras-chave |
| `TableBlock` | [`table-block.tsx`](../src/components/editor/extensions/table-block.tsx) | grade editável persistida como `AppBlock` `table` |
| `Mention` | [`mention-suggestion.tsx`](../src/components/editor/extensions/mention-suggestion.tsx) | `@` lista notas e cadernos e insere a menção que gera o backlink |
| `DragHandle` | [`drag-handle.ts`](../src/components/editor/extensions/drag-handle.ts) | alça lateral + botão “+”, plugin ProseMirror próprio |
| `Callout` | [`callout.tsx`](../src/components/editor/extensions/callout.tsx) | destaque com emoji clicável |
| `ToggleBlock` | [`toggle-block.tsx`](../src/components/editor/extensions/toggle-block.tsx) | conteúdo recolhível |
| `EquationBlock` | [`equation-block.tsx`](../src/components/editor/extensions/equation-block.tsx) | LaTeX renderizado com KaTeX, edição inline |
| `MediaBlock` | [`media-block.tsx`](../src/components/editor/extensions/media-block.tsx) | imagem/vídeo/áudio/arquivo |
| `SynapsysCodeBlock` | [`code-block.tsx`](../src/components/editor/extensions/code-block.tsx) | realce via lowlight, seletor de linguagem e detecção automática |
| `ParagraphIndent` | [`paragraph-indent.ts`](../src/components/editor/extensions/paragraph-indent.ts) | recuo de primeira linha estilo Word |
| `TextAlign` | [`text-align.ts`](../src/components/editor/extensions/text-align.ts) | esquerda / centro / direita / justificado |
| `Color` + `Highlight` | [`editor-colors.ts`](../src/components/editor/editor-colors.ts) | cor do texto e marca-texto da paleta |
| `EditorToolbar` | [`editor-toolbar.tsx`](../src/components/editor/editor-toolbar.tsx) | barra fixa: formatação, alinhamento, localizar, sumário |
| `FindBar` | [`find-bar.tsx`](../src/components/editor/find-bar.tsx) | `Cmd/Ctrl+F` na nota aberta |
| `NoteOutline` | [`note-outline.tsx`](../src/components/editor/note-outline.tsx) | sumário de títulos no menu da barra |
| `BubbleToolbar` | [`bubble-toolbar.tsx`](../src/components/editor/bubble-toolbar.tsx) | formatação flutuante sobre a seleção |

Sobre o **drag handle**: em vez de reimplementar arrastar e soltar, o plugin
monta uma `NodeSelection` no bloco sob o cursor e entrega a fatia para o
mecanismo nativo do ProseMirror (`view.dragging`). Assim posições de drop, undo e
mapeamento de posições continuam corretos de graça.

Sobre o **toggle**: o título fica em um atributo do nó, não no documento.
Recolher desmonta o corpo em vez de escondê-lo, o que evita conteúdo editável
invisível — armadilha clássica de `<details>` em editores.

`Underline` e `Link` **não** aparecem na lista acima porque o StarterKit 3.x já
os registra; declará-los de novo faz o TipTap avisar sobre nomes duplicados e
descartar uma das cópias. `Link` é configurado através das opções do StarterKit.

## 2.1. Tipografia

O corpo do editor herda `--font-editor` e `--font-editor-size`, definidos pelo
`AppShell` a partir das preferências do usuário
([`typography.ts`](../src/lib/typography.ts) lista as 13 famílias com nome e
classificação). Os tamanhos internos do editor — títulos, código, callouts —
estão em `em`, então um único ajuste de corpo reescala tudo proporcionalmente em
vez de mexer só no parágrafo.

## 3. Persistência

`onUpdate` → `docToBlocks` → `collectMentionIds` → `useDebounceAutoSave.schedule`.
Uma escrita por pausa de 900 ms na digitação, teto de 6 s para quem digita sem
parar, retry com backoff e flush garantido ao sair (`visibilitychange`,
`beforeunload`, unmount). O cabeçalho da nota mostra *Salvando… / Salvo*, e o
indicador pode ser desligado nas preferências.

O documento do TipTap é criado uma vez por `page.id`. Atualizações remotas da
*mesma* página não são forçadas de volta enquanto o usuário digita — isso brigaria
com o cursor. Cada gravação leva a base da edição (o último conteúdo que o
editor viu do banco) e um `writeId`. Se outra aba ou outro dispositivo gravou
nesse intervalo, o adaptador mescla em transação as duas versões por bloco
([`block-merge.ts`](../src/lib/data/block-merge.ts)); quando o eco da gravação
volta com `lastWriteId` igual ao `writeId` e conteúdo diferente, o editor adota
o resultado mesclado preservando a seleção. Inserções diferentes no mesmo ponto
ficam as duas e o aviso `page_merge_conflict` aparece.

`collectMentionIds` extrai os ids mencionados e grava em `outgoingLinks`; a seção
de backlinks de uma nota lista as notas que têm o id dela em `outgoingLinks`.
Menções com id do Notion (de importações antigas) são resolvidas pelo
`notionPageId` ao clicar.

## 4. Comandos disponíveis (`/`)

**Básico** — texto, título 1, título 2, título 3
**Listas** — marcadores, numerada, tarefas, toggle
**Blocos** — callout, citação, código, equação (LaTeX), divisor, tabela
**Mídia** — gravar nota de voz, anexar do computador (PDF, imagens e áudios)

Os itens de mídia não manipulam o documento diretamente: eles chamam callbacks do
componente hospedeiro, porque o upload depende do adaptador de dados (Cloud
Storage), não do estado do editor.

A barra fixa concentra o que o bubble menu não alcança sem seleção: desfazer,
alinhamento, recuo, cor, localizar e o sumário. `Cmd/Ctrl+F` abre o `FindBar`
só na nota — a busca global continua em `Cmd/Ctrl+K`.
