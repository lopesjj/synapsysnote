"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";


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
            "position:absolute;display:none;gap:1px;align-items:center;z-index:11;user-select:none;padding-right:12px;";

          let hideTimer: ReturnType<typeof setTimeout> | null = null;

          const cancelHide = () => {
            if (hideTimer) {
              clearTimeout(hideTimer);
              hideTimer = null;
            }
          };

          const scheduleHide = () => {
            cancelHide();
            hideTimer = setTimeout(() => {
              container.style.display = "none";
              state.pos = null;
              hideTimer = null;
            }, 250);
          };

          const hideImmediate = () => {
            cancelHide();
            container.style.display = "none";
            state.pos = null;
          };

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

          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.title = "Excluir bloco";
          deleteButton.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>';
          deleteButton.style.cssText =
            "display:flex;align-items:center;justify-content:center;width:20px;height:22px;border-radius:5px;color:var(--text-faint);background:transparent;border:none;cursor:pointer;";

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

          deleteButton.addEventListener("mouseenter", () => {
            deleteButton.style.background = "var(--surface-hover)";
            deleteButton.style.color = "#ef4444";
          });
          deleteButton.addEventListener("mouseleave", () => {
            deleteButton.style.background = "transparent";
            deleteButton.style.color = "var(--text-faint)";
          });

          container.append(addButton, dragButton, deleteButton);
          container.addEventListener("mouseenter", cancelHide);
          container.addEventListener("mouseleave", scheduleHide);

          const parent = view.dom.parentElement;
          if (parent) {
            if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
            parent.appendChild(container);
          }

          const onMouseMove = (event: MouseEvent) => {
            if (!view.editable) return;
            const target = event.target as HTMLElement;
            if (container.contains(target)) {
              cancelHide();
              return;
            }

            const hit = topLevelPosAt(view, event);
            if (!hit || !parent) {
              scheduleHide();
              return;
            }

            cancelHide();
            const parentRect = parent.getBoundingClientRect();
            const rect = hit.dom.getBoundingClientRect();
            state.pos = hit.pos;
            state.dom = hit.dom;
            container.style.display = "flex";
            container.style.top = `${rect.top - parentRect.top + 1}px`;
            container.style.left = `${rect.left - parentRect.left - 68}px`;
          };

          const onMouseLeave = (event: MouseEvent) => {
            const related = event.relatedTarget as HTMLElement | null;
            if (related && container.contains(related)) {
              cancelHide();
              return;
            }
            scheduleHide();
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

          deleteButton.addEventListener("click", () => {
            if (state.pos === null) return;
            const node = view.state.doc.nodeAt(state.pos);
            if (!node) return;
            const tr = view.state.tr.delete(state.pos, state.pos + node.nodeSize);
            view.dispatch(tr.scrollIntoView());
            view.focus();
            hideImmediate();
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
              cancelHide();
              view.dom.removeEventListener("mousemove", onMouseMove);
              view.dom.removeEventListener("mouseleave", onMouseLeave);
              container.removeEventListener("mouseenter", cancelHide);
              container.removeEventListener("mouseleave", scheduleHide);
              container.remove();
            },
          };
        },
      }),
    ];
  },
});
