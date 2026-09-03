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
EmptyState, Dialog animado, Menu e Popover.

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

[`sidebar.tsx`](../src/components/layout/sidebar.tsx) — busca, início,
importação, favoritos, cadernos com árvore infinita de páginas, bases de dados,
tags globais, lixeira e integrações. Cada linha tem menu de contexto (nova
subpágina, favoritar, mover para lixeira com desfazer no toast). Recolhe para uma
faixa de ícones com `Cmd+\`, e no mobile vira overlay.

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
