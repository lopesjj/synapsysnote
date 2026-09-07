import tippy, { type Instance as TippyInstance, type Props as TippyProps } from "tippy.js";

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
