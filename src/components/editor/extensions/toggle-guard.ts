import type { ViewMutationRecord } from "@tiptap/pm/view";

type LooseNode = {
  nodeType?: number;
  parentElement?: LooseNode | null;
  closest?: (selector: string) => LooseNode | null;
  contains?: (node: LooseNode) => boolean;
  querySelector?: (selector: string) => LooseNode | null;
  hasAttribute?: (name: string) => boolean;
  isContentEditable?: boolean;
};

function loose(node: unknown): LooseNode | null {
  if (!node || typeof node !== "object") return null;
  return node as LooseNode;
}

function asElement(node: unknown): LooseNode | null {
  const current = loose(node);
  if (!current) return null;
  if (current.nodeType === 1) return current;
  return current.parentElement ?? null;
}

function hasAttr(node: LooseNode, name: string) {
  return Boolean(node.hasAttribute?.(name));
}

function hostsContentRoot(node: LooseNode) {
  if (node.nodeType !== 1) return false;
  if (hasAttr(node, "data-node-view-content-react") || hasAttr(node, "data-node-view-content")) return true;
  return Boolean(node.querySelector?.("[data-node-view-content-react]"));
}

function insideContent(element: LooseNode) {
  if (hasAttr(element, "data-node-view-content-react")) return true;
  return Boolean(element.closest?.("[data-node-view-content-react]"));
}

function isContentRoot(element: LooseNode) {
  return hasAttr(element, "data-node-view-content-react") || hasAttr(element, "data-node-view-content");
}

export function ignoreToggleMutation(mutation: ViewMutationRecord) {
  if (mutation.type === "selection") {
    return Boolean(asElement(mutation.target)?.closest?.(".synapsys-toggle__trigger"));
  }

  const changed = [
    ...Array.from("addedNodes" in mutation ? mutation.addedNodes : []),
    ...Array.from("removedNodes" in mutation ? mutation.removedNodes : []),
  ].map(loose).filter((node): node is LooseNode => Boolean(node));

  if (changed.some(hostsContentRoot)) return true;

  const element = asElement(mutation.target);
  if (!element) return true;

  if (mutation.type === "attributes") {
    if (isContentRoot(element)) return true;
    return !insideContent(element);
  }

  if (mutation.type === "characterData") {
    return !insideContent(element);
  }

  if (mutation.type === "childList") {
    if (insideContent(element) || isContentRoot(element)) return false;
    const editable = changed.some((node) => node.nodeType === 1 && node.isContentEditable);
    return !editable;
  }

  return true;
}

export function isToggleChromeTarget(target: EventTarget | null) {
  const element = asElement(target);
  if (!element?.closest) return false;
  const toggle = element.closest(".synapsys-toggle");
  if (!toggle?.querySelector || !toggle.contains) return false;
  const content = toggle.querySelector("[data-node-view-content]");
  if (content?.contains?.(element)) return false;
  return true;
}
