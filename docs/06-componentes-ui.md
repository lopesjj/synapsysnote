# ETAPA 6 — Componentes de interface

## 1. Design system

[`src/app/globals.css`](../src/app/globals.css) define tokens semânticos em CSS
variables, com Tailwind v4 mapeando `--color-*` sobre eles. Componentes usam
`bg-[var(--surface)]` / `text-ink`, nunca cores fixas — trocar de tema é trocar o
valor da variável, e o modo claro não é uma pilha de `dark:` espalhada pelo JSX.

| Token | Escuro | Claro |
| --- | --- | --- |
| canvas | `#090A0C` | `#F9FAFB` |
| superfície elevada | `#121417` | `#FFFFFF` |
| borda | `rgba(255,255,255,0.07)` | `#E5E7EB` |
| acento | `#8B5CF6` | `#6366F1` |

Tipografia: **Geist Sans** na interface, **JetBrains Mono** em código e métricas,
**KaTeX** em equações. Números que mudam ao vivo usam `tabular-nums` para não
tremer.

Movimento: Framer Motion com `cubic-bezier(0.16, 1, 0.3, 1)` e springs curtas
(stiffness ~420, damping ~34). Modais entram com leve elevação, listas expandem
por altura animada, cartões do Kanban usam `layout`.

Primitivas em [`src/components/ui/`](../src/components/ui/) sobre Radix: Button,
Input, Checkbox tri-state, Switch, Tabs, Tooltip, Progress, Badge, Kbd, Skeleton,
EmptyState, Dialog animado, Menu, Popover e
[`icon-picker.tsx`](../src/components/ui/icon-picker.tsx) (emoji, bandeiras e
upload de imagem).

## 2. Notion Import Wizard

[`import-wizard.tsx`](../src/components/notion/import-wizard.tsx) — quatro passos
com transição horizontal:

1. **Conectar** — explica onde o token fica guardado antes de pedir autorização.
2. **Selecionar** — árvore hierárquica com checkboxes; marcar um pai marca os
   descendentes, e um pai parcialmente marcado exibe estado indeterminado.
   Bases de dados mostram a contagem de registros. Há um "importar todo o
   workspace" no topo. Enquanto a árvore carrega, aparecem esqueletos com recuo
   variável — não um spinner genérico.
3. **Revisar** — cartões com páginas/bases/registros, escolha do caderno de
   destino e quatro opções de conversão, cada uma explicando a consequência
   (inclusive por que as mídias precisam ser rehospedadas).
4. **Progresso** — barra animada, percentual, contadores de páginas, arquivos e
   bytes, lista por item com ícone de estado e link "abrir" assim que a página
   existe, e um painel de avisos quando algum item falha.

Fechar o modal durante a importação não cancela: um pill flutuante no canto
mostra o andamento e reabre o wizard. Cancelar é explícito.

## 3. Sidebar

[`sidebar.tsx`](../src/components/layout/sidebar.tsx) — busca, início, todas as
notas, importação, favoritos, **páginas** (cadernos-raiz) com cadernos aninhados
e árvore de notas, bases de dados, tags globais, lixeira. O rodapé tem o
[`user-menu.tsx`](../src/components/layout/user-menu.tsx) (tema, foco,
preferências, integrações, sair). Cada linha tem menu de contexto (nova
subpágina / caderno, duplicar, favoritar, mover para lixeira com desfazer no
toast). Recolhe para uma faixa de ícones com `Cmd/Ctrl+B`, é redimensionável
arrastando a borda, e no mobile vira overlay.

**Reordenação por arrastar** (`@dnd-kit`): páginas/cadernos entre si (incluindo
aninhar um caderno soltando sobre outro), notas entre irmãs, e soltar uma nota
sobre o cabeçalho de um caderno a move para lá. A ordem é um campo `order`
esparso, renumerado em passos fixos na lista de irmãs afetada — o que mantém as
escritas limitadas a uma lista e evita a deriva de índices fracionários.

Duas decisões não óbvias:

- **Detecção de colisão filtrada.** A linha de um caderno tem alguns pixels de
  altura, enquanto sua lista de páginas expandida ocupa a tela inteira. Sem
  filtrar, quase todo arrasto de caderno resolvia para uma *página* dentro do
  alvo. Arrastar um caderno passa a considerar só cadernos, e a detecção
  prefere a linha realmente sob o cursor (`pointerWithin`) com `closestCenter`
  como reserva para os vãos entre linhas.
- **A decisão mora fora do componente.** [`sidebar-dnd.ts`](../src/components/layout/sidebar-dnd.ts)
  não importa nada do dnd-kit e responde só a “dado o que foi arrastado e onde
  soltou, o que muda?”. Automatizar arrastar no navegador é pouco confiável, e
  um teste que falha não distinguiria lógica errada de gesto mal sintetizado.
  `npm run verify:sidebar-dnd` cobre cada caso, inclusive aninhar um caderno e
  a recusa de mover uma nota para dentro da própria subárvore. A hierarquia de
  `parentId` em si é coberta por `npm run verify:notebook-tree`.

## 3.1. Lista de notas

[`notes-explorer.tsx`](../src/components/notes/notes-explorer.tsx) — os três
formatos que os apps clássicos estabeleceram: lista compacta, cartões e painel
duplo com prévia ao vivo. O mesmo componente serve “Todas as notas”, uma página, um caderno
e uma tag: a diferença entre eles é só o recorte recebido.

A prévia renderiza os blocos armazenados direto
([`block-preview.tsx`](../src/components/notes/block-preview.tsx)) em vez de
montar um ProseMirror por seleção — no painel duplo, cada clique na lista
trocaria o documento do editor.

## 3.2. Página e caderno

[`notebook-view.tsx`](../src/components/page/notebook-view.tsx) — rota
`/app/n/{id}`. Capa e ícone (emoji, bandeira ou imagem em
`uploads/icons/`), título editável, cadernos filhos, notas e bases. O mesmo
documento serve página (raiz) e caderno (aninhado); os rótulos vêm de
[`notebook-copy.ts`](../src/lib/data/notebook-copy.ts).

Capa: [`cover-picker.tsx`](../src/components/page/cover-picker.tsx) +
[`covers/presets.ts`](../src/lib/covers/presets.ts) (gradientes nomeados
guardados em `coverUrl` como `cover:teal`, etc.). Ícone:
[`icon-picker.tsx`](../src/components/ui/icon-picker.tsx) +
[`icons/catalog.ts`](../src/lib/icons/catalog.ts).

O cabeçalho de nota e de caderno compartilham
[`workspace-crumbs.tsx`](../src/components/page/workspace-crumbs.tsx): setas
voltar/avançar da sessão e migalhas clicáveis da cadeia de ancestrais. O título
da aba do navegador acompanha a rota
([`document-title.tsx`](../src/components/layout/document-title.tsx)).

## 3.3. Preferências

[`preferences-dialog.tsx`](../src/components/layout/preferences-dialog.tsx) —
`Cmd/Ctrl+,`. Tema, modo foco, layout da lista, densidade (lista, barra
lateral e editor), ordenação padrão,
13 famílias tipográficas nomeadas e agrupadas por classificação
([`typography.ts`](../src/lib/typography.ts)) com corpo e largura de leitura
ajustáveis, perfil (nome de exibição e provedores vinculados) e a referência de
atalhos. Tudo grava no store do Zustand, que persiste local e espelha em
`users/{uid}.preferences`.

## 4. Command Palette

[`command-palette.tsx`](../src/components/layout/command-palette.tsx) — `Cmd/Ctrl+K`.
Sem consulta, mostra recentes e ações; com consulta, resultados da busca híbrida.
Resultados que casaram por OCR ou por transcrição recebem selo indicando o motivo.

## 5. Tabela e Kanban

[`database-view.tsx`](../src/components/database/database-view.tsx) — as duas
visualizações leem as mesmas linhas.

- **Tabela**: edição inline por tipo de propriedade
  ([`property-cell.tsx`](../src/components/database/property-cell.tsx)) — texto,
  número alinhado à direita em fonte mono, seleção com chips coloridos,
  multi-seleção com marcação múltipla, data nativa, checkbox, URL.
- **Kanban**: colunas derivadas das opções da propriedade de seleção, com uma
  coluna "Sem status" para linhas fora do conjunto. Arrastar com `@dnd-kit`
  atualiza o valor da propriedade; a coluna sob o cursor destaca; o overlay
  inclina o cartão levemente durante o arrasto.

## 6. Estados vazios, carregamento e erro

Cada superfície trata os três: esqueletos com a forma do conteúdo real (não
spinners), vazios com uma ação concreta em vez de só uma frase, e erros com o
texto do problema e um botão de repetir. Páginas inexistentes explicam a
possibilidade da lixeira em vez de mostrar 404 seco.
