import { compareNatural } from "@/lib/utils";
import type {
  ListSortPreference,
  Notebook,
  Page,
  SortDirectionPreference,
} from "@/types/models";
import type { PageTreeNode } from "./provider";

function compareTimestamps(a: number, b: number): number {
  return a - b;
}

export function compareNotebooks(
  a: Notebook,
  b: Notebook,
  sort: ListSortPreference
): number {
  if (sort === "name") return compareNatural(a.name, b.name);
  if (sort === "updated") return compareTimestamps(a.updatedAt, b.updatedAt);
  if (sort === "created") return compareTimestamps(a.createdAt, b.createdAt);
  return (a.order ?? 0) - (b.order ?? 0) || compareNatural(a.name, b.name);
}

export function comparePages(a: Page, b: Page, sort: ListSortPreference): number {
  if (sort === "name") return compareNatural(a.title, b.title);
  if (sort === "updated") return compareTimestamps(a.updatedAt, b.updatedAt);
  if (sort === "created") return compareTimestamps(a.createdAt, b.createdAt);
  return (a.order ?? 0) - (b.order ?? 0) || compareNatural(a.title, b.title);
}

function applyDirection<T>(
  items: T[],
  sort: ListSortPreference,
  direction: SortDirectionPreference
): T[] {
  return sort !== "manual" && direction === "desc" ? items.reverse() : items;
}

export function sortNotebooks(
  items: Notebook[],
  sort: ListSortPreference,
  direction: SortDirectionPreference
): Notebook[] {
  return applyDirection(
    [...items].sort((a, b) => compareNotebooks(a, b, sort)),
    sort,
    direction
  );
}

export function sortPages(
  items: Page[],
  sort: ListSortPreference,
  direction: SortDirectionPreference
): Page[] {
  return applyDirection(
    [...items].sort((a, b) => comparePages(a, b, sort)),
    sort,
    direction
  );
}

export function sortPageTree(
  nodes: PageTreeNode[],
  sort: ListSortPreference,
  direction: SortDirectionPreference,
  childSort: ListSortPreference = sort,
  childDirection: SortDirectionPreference = direction
): PageTreeNode[] {
  const mapped = nodes.map((node) =>
    node.children.length
      ? {
          ...node,
          children: sortPageTree(
            node.children,
            childSort,
            childDirection,
            childSort,
            childDirection
          ),
        }
      : node
  );
  return applyDirection(
    mapped.sort((a, b) => comparePages(a.page, b.page, sort)),
    sort,
    direction
  );
}
