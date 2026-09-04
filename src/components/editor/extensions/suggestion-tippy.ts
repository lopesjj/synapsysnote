import tippy, { type Instance as TippyInstance, type Props as TippyProps } from "tippy.js";

/**
 * Shared Tippy mount for `/` and `@` suggestion lists.
 *
 * The lists already draw their own chrome, so the box is unstyled — we only
 * need Tippy for positioning. `clientRect` is sometimes missing on the first
 * `onStart` (the caret has not been measured yet); callers should call
 * `ensureSuggestionPopup` again from `onUpdate`.
 */
export function ensureSuggestionPopup(
  popup: TippyInstance | null,
  getRect: (() => DOMRect) | null | undefined,
  content: Element
): TippyInstance | null {
  if (!getRect) return popup;
  if (popup) {
    popup.setProps({ getReferenceClientRect: getRect } as Partial<TippyProps>);
    if (popup.state.isDestroyed) return popup;
    if (!popup.state.isShown) popup.show();
    return popup;
  }
  return tippy(document.body, {
    getReferenceClientRect: getRect,
    appendTo: () => document.body,
    content,
    showOnCreate: true,
    interactive: true,
    trigger: "manual",
    placement: "bottom-start",
    offset: [0, 8],
    zIndex: 80,
    maxWidth: "none",
    theme: "synapsys",
  });
}
