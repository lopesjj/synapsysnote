import "server-only";

import type { Client } from "@notionhq/client";
import type { NotionTreeNode } from "@/types/models";
import { compareNatural } from "@/lib/utils";
import { throttled } from "./throttle";

/**
 * ETAPA 3.2 — Reads everything the integration can see and rebuilds the
 * hierarchy the wizard renders.
 *
 * `POST /v1/search` returns a flat list with a `parent` pointer, so the tree is
 * assembled locally; entries whose parent was not shared with the integration
 * are promoted to roots instead of being dropped.
 */
export async function listNotionTree(notion: Client): Promise<NotionTreeNode[]> {
  const flat = new Map<string, NotionTreeNode & { parentId: string | null }>();
  let cursor: string | undefined;

  do {
    const response = await throttled(() =>
      notion.search({
        page_size: 100,
        start_cursor: cursor,
        sort: { direction: "descending", timestamp: "last_edited_time" },
      })
    );

    for (const result of response.results as unknown as Record<string, never>[]) {
      const object = result.object as unknown as "page" | "database";
      const id = result.id as unknown as string;
      const parent = result.parent as unknown as {
        type: string;
        page_id?: string;
        database_id?: string;
        block_id?: string;
      };

      flat.set(id, {
        id,
        title: extractTitle(result, object),
        type: object === "database" ? "database" : "page",
        icon: extractIcon(result),
        lastEditedTime: result.last_edited_time as unknown as string,
        parentId: parent?.page_id ?? parent?.database_id ?? parent?.block_id ?? null,
        children: [],
      });
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const roots: NotionTreeNode[] = [];
  for (const node of flat.values()) {
    const parent = node.parentId ? flat.get(node.parentId) : null;
    if (parent) parent.children!.push(node);
    else roots.push(node);
  }

  const prune = (nodes: NotionTreeNode[]): NotionTreeNode[] =>
    nodes
      .map((node) => ({
        ...node,
        childCount: node.type === "database" ? node.children?.length : undefined,
        children: node.children?.length ? prune(node.children) : undefined,
      }))
      .sort((a, b) => compareNatural(a.title, b.title));

  return prune(roots);
}

function extractTitle(result: Record<string, never>, object: string): string {
  if (object === "database") {
    const title = result.title as unknown as { plain_text: string }[] | undefined;
    return title?.map((t) => t.plain_text).join("") || "Base de dados sem título";
  }
  const properties = result.properties as unknown as
    | Record<string, { type: string; title?: { plain_text: string }[] }>
    | undefined;
  const titleProp = properties
    ? Object.values(properties).find((property) => property.type === "title")
    : undefined;
  return titleProp?.title?.map((t) => t.plain_text).join("") || "Página sem título";
}

function extractIcon(result: Record<string, never>): string | null {
  const icon = result.icon as unknown as {
    type?: string;
    emoji?: string;
    external?: { url?: string };
    file?: { url?: string };
  } | null;
  if (!icon) return null;
  if (icon.type === "emoji" || icon.emoji) return icon.emoji ?? null;
  if (icon.type === "external") return icon.external?.url ?? null;
  if (icon.type === "file") return icon.file?.url ?? null;
  return null;
}

/** Depth-first order guarantees a parent is imported before its children. */
export function orderForImport(tree: NotionTreeNode[], selected: Set<string>): NotionTreeNode[] {
  const ordered: NotionTreeNode[] = [];
  const walk = (nodes: NotionTreeNode[]) => {
    for (const node of nodes) {
      if (selected.has(node.id)) ordered.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);
  return ordered;
}

export function buildParentMap(tree: NotionTreeNode[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const walk = (nodes: NotionTreeNode[], parent: string | null) => {
    for (const node of nodes) {
      map.set(node.id, parent);
      if (node.children?.length) walk(node.children, node.id);
    }
  };
  walk(tree, null);
  return map;
}
