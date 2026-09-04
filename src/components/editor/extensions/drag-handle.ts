"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * ETAPA 5 — Lateral drag handles.
 *
 * A single floating control follows the hovered top-level block. Dragging hands
 * a `NodeSelection` slice to ProseMirror's own drag machinery, so drop
 * positions, undo and collaborative mapping all keep working. The `+` button
 * inserts an empty paragraph right after the hovered block.
 */

const key = new PluginKey("synapsysDragHandle");

interface HandleState {
  pos: number | null;
  dom: HTMLElement | null;
}

function topLevelPosAt(view: EditorView, event: MouseEvent): { pos: number; dom: HTMLElement } | null {
  const found = view.posAtCoords({ left: event.clientX + 60, top: event.clientY });
  if (!found) return null;

  try {
    const $pos = view.state.doc.resolve(found.inside > -1 ? found.inside : found.pos);
    if ($pos.depth === 0) return null;
    const pos = $pos.before(1);
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return null;
    return { pos, dom };
  } catch {
    // Coordinates outside any resolvable node (gaps, decorations).
    return null;
  }
}

export const DragHandle = Extension.create({
  name: "synapsysDragHandle",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        view(view) {
          const state: HandleState = { pos: null, dom: null };

          const container = document.createElement("div");
          container.className = "synapsys-drag-handle";
          container.style.cssText =
            "position:absolute;display:none;gap:1px;align-items:center;z-index:11;user-select:none;";

          const addButton = document.createElement("button");
          addButton.type = "button";
          addButton.title = "Inserir bloco abaixo";
          addButton.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
          addButton.style.cssText =
            "display:flex;align-items:center;justify-content:center;width:20px;height:22px;border-radius:5px;color:var(--text-faint);background:transparent;border:none;cursor:pointer;";

          const dragButton = document.createElement("button");
          dragButton.type = "button";
          dragButton.title = "Arrastar para reordenar";
          dragButton.draggable = true;
          dragButton.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
          dragButton.style.cssText =
            "display:flex;align-items:center;justify-content:center;width:20px;height:22px;border-radius:5px;color:var(--text-faint);background:transparent;border:none;cursor:grab;";

          for (const button of [addButton, dragButton]) {
            button.addEventListener("mouseenter", () => {
              button.style.background = "var(--surface-hover)";
              button.style.color = "var(--text-muted)";
            });
            button.addEventListener("mouseleave", () => {
              button.style.background = "transparent";
              button.style.color = "var(--text-faint)";
            });
          }

          container.append(addButton, dragButton);
          const parent = view.dom.parentElement;
          if (parent) {
            // The handle is absolutely positioned against this element, so it
            // must establish a containing block.
            if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
            parent.appendChild(container);
          }

          const hide = () => {
            container.style.display = "none";
            state.pos = null;
          };

          const onMouseMove = (event: MouseEvent) => {
            if (!view.editable) return;
            const target = event.target as HTMLElement;
            if (container.contains(target)) return;

            const hit = topLevelPosAt(view, event);
            if (!hit || !parent) return hide();

            const parentRect = parent.getBoundingClientRect();
            const rect = hit.dom.getBoundingClientRect();
            state.pos = hit.pos;
            state.dom = hit.dom;
            container.style.display = "flex";
            container.style.top = `${rect.top - parentRect.top + 1}px`;
            container.style.left = `${rect.left - parentRect.left - 46}px`;
          };

          const onMouseLeave = (event: MouseEvent) => {
            const related = event.relatedTarget as HTMLElement | null;
            if (related && container.contains(related)) return;
            hide();
          };

          addButton.addEventListener("click", () => {
            if (state.pos === null) return;
            const node = view.state.doc.nodeAt(state.pos);
            if (!node) return;
            const insertAt = state.pos + node.nodeSize;
            const tr = view.state.tr.insert(
              insertAt,
              view.state.schema.nodes.paragraph.create()
            );
            view.dispatch(tr.scrollIntoView());
            view.focus();
          });

          dragButton.addEventListener("dragstart", (event) => {
            if (state.pos === null || !state.dom) return;
            const selection = NodeSelection.create(view.state.doc, state.pos);
            view.dispatch(view.state.tr.setSelection(selection));
            const slice = view.state.selection.content();
            view.dragging = { slice, move: true };
            event.dataTransfer?.setDragImage(state.dom, 12, 12);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
            dragButton.style.cursor = "grabbing";
          });

          dragButton.addEventListener("dragend", () => {
            dragButton.style.cursor = "grab";
          });

          view.dom.addEventListener("mousemove", onMouseMove);
          view.dom.addEventListener("mouseleave", onMouseLeave);

          return {
            destroy() {
              view.dom.removeEventListener("mousemove", onMouseMove);
              view.dom.removeEventListener("mouseleave", onMouseLeave);
              container.remove();
            },
          };
        },
      }),
    ];
  },
});
