import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { isVideoMedia } from "@/lib/plans/definitions";

function isVideoNode(node: PMNode): boolean {
  if (node.type.name !== "mediaBlock") return false;
  const { mediaType, name, mimeType } = node.attrs as { mediaType?: unknown; name?: unknown; mimeType?: unknown };
  return (
    mediaType === "video" ||
    isVideoMedia({
      name: typeof name === "string" ? name : null,
      type: typeof mimeType === "string" ? mimeType : null,
    })
  );
}

function fragmentHasVideo(fragment: Fragment): boolean {
  let found = false;
  fragment.descendants((node) => {
    if (found) return false;
    if (isVideoNode(node)) found = true;
    return !found;
  });
  return found;
}

function stripVideo(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    if (isVideoNode(node)) return;
    nodes.push(node.isLeaf || !node.content.size ? node : node.copy(stripVideo(node.content)));
  });
  return Fragment.fromArray(nodes);
}

export function sliceHasVideo(slice: Slice): boolean {
  return fragmentHasVideo(slice.content);
}

export function sliceWithoutVideo(slice: Slice): Slice {
  return new Slice(stripVideo(slice.content), 0, 0);
}
