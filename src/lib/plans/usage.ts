import { partitionWorkspace } from "@/lib/data/workspace-partition";
import type { ArchivePlan } from "@/lib/data/archive";
import type { LimitKey, PlanLimits } from "./definitions";
import { PlanError, type LimitViolation } from "./errors";

export const UNFILED = "~unfiled";

export interface UsageNotebook {
  id: string;
  parentId?: string | null;
  archived?: boolean;
  archivedFromParentId?: string | null;
  deletedAt?: number | null;
  trashedWith?: string | null;
}

export interface UsagePage {
  id: string;
  notebookId: string | null;
  parentPageId: string | null;
  path?: string[];
  archived?: boolean;
  deletedAt?: number | null;
  trashedWith?: string | null;
}

export interface WorkspaceState<N extends UsageNotebook = UsageNotebook, P extends UsagePage = UsagePage> {
  notebooks: N[];
  pages: P[];
}

export interface Usage {
  pages: number;
  notebooksByPage: Map<string, number>;
  notesByNotebook: Map<string, number>;
  subnotesByNote: Map<string, number>;
}

export interface UsageSummary {
  pages: number;
  maxNotebooksPerPage: number;
  maxNotesPerNotebook: number;
  maxSubnotesPerNote: number;
}

function parentIdOf(notebook: UsageNotebook): string | null {
  const parentId = notebook.parentId;
  if (!parentId || parentId === "null") return null;
  return parentId;
}

function isRootPage(notebook: UsageNotebook): boolean {
  return !parentIdOf(notebook) && !notebook.archivedFromParentId;
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function measureUsage(state: WorkspaceState): Usage {
  const { liveNotebooks, livePages } = partitionWorkspace(state.notebooks, state.pages);
  const notebookById = new Map(liveNotebooks.map((notebook) => [notebook.id, notebook]));
  const pageKeyCache = new Map<string, string>();

  const pageKeyOf = (notebook: UsageNotebook): string => {
    const cached = pageKeyCache.get(notebook.id);
    if (cached) return cached;
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: UsageNotebook | undefined = notebook;
    let key = UNFILED;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.push(current.id);
      const known = pageKeyCache.get(current.id);
      if (known) {
        key = known;
        break;
      }
      const parentId = parentIdOf(current);
      if (!parentId) {
        key = current.archivedFromParentId ? UNFILED : current.id;
        break;
      }
      current = notebookById.get(parentId);
      if (!current) key = UNFILED;
    }
    for (const id of chain) pageKeyCache.set(id, key);
    return key;
  };

  let pages = 0;
  const notebooksByPage = new Map<string, number>();
  for (const notebook of liveNotebooks) {
    if (isRootPage(notebook)) {
      pages += 1;
      continue;
    }
    bump(notebooksByPage, pageKeyOf(notebook));
  }

  const pageById = new Map(livePages.map((page) => [page.id, page]));
  const topCache = new Map<string, string>();
  const topOf = (page: UsagePage): string => {
    const cached = topCache.get(page.id);
    if (cached) return cached;
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: UsagePage = page;
    let top = page.id;
    for (;;) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      chain.push(current.id);
      const known = topCache.get(current.id);
      if (known) {
        top = known;
        break;
      }
      const parent = current.parentPageId ? pageById.get(current.parentPageId) : undefined;
      if (!parent || seen.has(parent.id)) {
        top = current.id;
        break;
      }
      current = parent;
    }
    for (const id of chain) topCache.set(id, top);
    return top;
  };

  const notesByNotebook = new Map<string, number>();
  const subnotesByNote = new Map<string, number>();
  for (const page of livePages) {
    const top = topOf(page);
    if (top === page.id) bump(notesByNotebook, page.notebookId ?? UNFILED);
    else bump(subnotesByNote, top);
  }

  return { pages, notebooksByPage, notesByNotebook, subnotesByNote };
}

function maxOf(map: Map<string, number>): number {
  let max = 0;
  for (const value of map.values()) if (value > max) max = value;
  return max;
}

export function summarizeUsage(usage: Usage): UsageSummary {
  return {
    pages: usage.pages,
    maxNotebooksPerPage: maxOf(usage.notebooksByPage),
    maxNotesPerNotebook: maxOf(usage.notesByNotebook),
    maxSubnotesPerNote: maxOf(usage.subnotesByNote),
  };
}

export function growthViolations(before: Usage, after: Usage, limits: PlanLimits): LimitViolation[] {
  const violations: LimitViolation[] = [];
  const check = (key: LimitKey, previous: number, next: number) => {
    const limit = limits[key];
    if (limit === null || next <= previous || next <= limit) return;
    violations.push({ key, limit, count: next });
  };
  check("pages", before.pages, after.pages);
  const perContainer = (key: LimitKey, previous: Map<string, number>, next: Map<string, number>) => {
    for (const [container, count] of next) check(key, previous.get(container) ?? 0, count);
  };
  perContainer("notebooksPerPage", before.notebooksByPage, after.notebooksByPage);
  perContainer("notesPerNotebook", before.notesByNotebook, after.notesByNotebook);
  perContainer("subnotesPerNote", before.subnotesByNote, after.subnotesByNote);
  return violations;
}

export function firstGrowthViolation(
  before: WorkspaceState,
  after: WorkspaceState,
  limits: PlanLimits
): LimitViolation | null {
  if (!hasStructuralLimits(limits)) return null;
  return growthViolations(measureUsage(before), measureUsage(after), limits)[0] ?? null;
}

export function goalGrowthViolation(
  activeBefore: number,
  activeAfter: number,
  limit: number | null
): LimitViolation | null {
  if (limit === null || activeAfter <= activeBefore || activeAfter <= limit) return null;
  return { key: "activeGoals", limit, count: activeAfter };
}

let syntheticCounter = 0;
function syntheticId(prefix: string): string {
  syntheticCounter += 1;
  return `~${prefix}-${syntheticCounter}`;
}

export function withNewNotebook(state: WorkspaceState, parentId: string | null | undefined): WorkspaceState {
  return {
    notebooks: [
      ...state.notebooks,
      { id: syntheticId("notebook"), parentId: parentId ?? null, archived: false, deletedAt: null },
    ],
    pages: state.pages,
  };
}

export function withNewPage(
  state: WorkspaceState,
  target: { notebookId?: string | null; parentPageId?: string | null }
): WorkspaceState {
  return {
    notebooks: state.notebooks,
    pages: [
      ...state.pages,
      {
        id: syntheticId("page"),
        notebookId: target.notebookId ?? null,
        parentPageId: target.parentPageId ?? null,
        archived: false,
        deletedAt: null,
      },
    ],
  };
}

function childrenByParent(pages: UsagePage[]): Map<string, UsagePage[]> {
  const map = new Map<string, UsagePage[]>();
  for (const page of pages) {
    if (!page.parentPageId) continue;
    const list = map.get(page.parentPageId) ?? [];
    list.push(page);
    map.set(page.parentPageId, list);
  }
  return map;
}

function copyPageTree(
  source: UsagePage,
  children: Map<string, UsagePage[]>,
  placement: { notebookId: string | null; parentPageId: string | null },
  out: UsagePage[],
  seen: Set<string>
) {
  if (seen.has(source.id)) return;
  seen.add(source.id);
  const id = syntheticId("page");
  out.push({ id, notebookId: placement.notebookId, parentPageId: placement.parentPageId, archived: false, deletedAt: null });
  for (const child of children.get(source.id) ?? []) {
    copyPageTree(child, children, { notebookId: placement.notebookId, parentPageId: id }, out, seen);
  }
}

export function withDuplicatedPage(state: WorkspaceState, pageId: string): WorkspaceState {
  const nonDeleted = state.pages.filter((page) => !page.deletedAt);
  const source = nonDeleted.find((page) => page.id === pageId);
  if (!source) return state;
  const copies: UsagePage[] = [];
  copyPageTree(
    source,
    childrenByParent(nonDeleted),
    { notebookId: source.notebookId ?? null, parentPageId: source.parentPageId ?? null },
    copies,
    new Set()
  );
  return { notebooks: state.notebooks, pages: [...state.pages, ...copies] };
}

export function withDuplicatedNotebook(state: WorkspaceState, notebookId: string): WorkspaceState {
  const notebooks = state.notebooks.filter((notebook) => !notebook.deletedAt);
  const pages = state.pages.filter((page) => !page.deletedAt);
  const source = notebooks.find((notebook) => notebook.id === notebookId);
  if (!source) return state;
  const children = childrenByParent(pages);
  const notebookCopies: UsageNotebook[] = [];
  const pageCopies: UsagePage[] = [];
  const visited = new Set<string>();

  const copyNotebook = (original: UsageNotebook, parentId: string | null) => {
    if (visited.has(original.id)) return;
    visited.add(original.id);
    const id = syntheticId("notebook");
    notebookCopies.push({ id, parentId, archived: false, deletedAt: null });
    const notes = pages.filter((page) => page.notebookId === original.id);
    const inNotebook = new Set(notes.map((page) => page.id));
    const seen = new Set<string>();
    for (const root of notes.filter((page) => !page.parentPageId || !inNotebook.has(page.parentPageId))) {
      copyPageTree(root, children, { notebookId: id, parentPageId: null }, pageCopies, seen);
    }
    for (const child of notebooks.filter((notebook) => parentIdOf(notebook) === original.id)) {
      copyNotebook(child, id);
    }
  };

  copyNotebook(source, parentIdOf(source));
  return {
    notebooks: [...state.notebooks, ...notebookCopies],
    pages: [...state.pages, ...pageCopies],
  };
}

function isNotebookAncestor(notebooks: UsageNotebook[], candidateAncestorId: string, notebookId: string): boolean {
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const seen = new Set<string>();
  let current = byId.get(notebookId)?.parentId ?? null;
  while (current && !seen.has(current)) {
    if (current === candidateAncestorId) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

export function withMovedNotebook(state: WorkspaceState, id: string, parentId: string | null): WorkspaceState {
  if (parentId === id) return state;
  if (parentId) {
    if (!state.notebooks.some((notebook) => notebook.id === parentId)) return state;
    if (isNotebookAncestor(state.notebooks, id, parentId)) return state;
  }
  return {
    notebooks: state.notebooks.map((notebook) =>
      notebook.id === id ? { ...notebook, parentId, archivedFromParentId: null } : notebook
    ),
    pages: state.pages,
  };
}

function pageDescendantIds(pages: UsagePage[], pageId: string): Set<string> {
  const children = childrenByParent(pages);
  const ids = new Set<string>();
  const stack: string[] = [pageId];
  for (const page of pages) {
    if (page.id !== pageId && page.path?.includes(pageId) && !ids.has(page.id)) {
      ids.add(page.id);
      stack.push(page.id);
    }
  }
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of children.get(current) ?? []) {
      if (child.id === pageId || ids.has(child.id)) continue;
      ids.add(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

export function withMovedPage(
  state: WorkspaceState,
  id: string,
  target: { notebookId?: string | null; parentPageId?: string | null }
): WorkspaceState {
  const moved = state.pages.find((page) => page.id === id);
  if (!moved) return state;
  const parentPageId = target.parentPageId ?? null;
  if (parentPageId) {
    if (parentPageId === id) return state;
    const parent = state.pages.find((page) => page.id === parentPageId);
    if (parent?.path?.includes(id)) return state;
    if (pageDescendantIds(state.pages, id).has(parentPageId)) return state;
  }
  const notebookId = target.notebookId !== undefined ? target.notebookId : (moved.notebookId ?? null);
  const descendants = pageDescendantIds(state.pages, id);
  return {
    notebooks: state.notebooks,
    pages: state.pages.map((page) => {
      if (page.id === id) return { ...page, notebookId, parentPageId };
      if (descendants.has(page.id)) return { ...page, notebookId };
      return page;
    }),
  };
}

function restoreNotebookChain(notebooks: UsageNotebook[], notebookId: string | null | undefined): Set<string> {
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const restored = new Set<string>();
  const seen = new Set<string>();
  let current = notebookId ? byId.get(notebookId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.deletedAt) restored.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return restored;
}

function reviveNotebooks(notebooks: UsageNotebook[], ids: Set<string>): UsageNotebook[] {
  if (!ids.size) return notebooks;
  return notebooks.map((notebook) =>
    ids.has(notebook.id) ? { ...notebook, deletedAt: null, trashedWith: null } : notebook
  );
}

export function withRestoredPage(state: WorkspaceState, id: string): WorkspaceState {
  const page = state.pages.find((entry) => entry.id === id);
  if (!page) return state;
  const parent = page.parentPageId ? state.pages.find((entry) => entry.id === page.parentPageId) : undefined;
  const detach = Boolean(page.parentPageId) && (!parent || Boolean(parent.deletedAt));
  const subtree = new Set<string>([id]);
  for (const entry of state.pages) {
    if (entry.path?.includes(id) || entry.parentPageId === id) subtree.add(entry.id);
  }
  const pathDescendants = new Set(state.pages.filter((entry) => entry.path?.includes(id)).map((entry) => entry.id));
  const notebookId = page.notebookId ?? null;
  return {
    notebooks: reviveNotebooks(state.notebooks, restoreNotebookChain(state.notebooks, page.notebookId)),
    pages: state.pages.map((entry) => {
      if (!subtree.has(entry.id)) return entry;
      if (detach && entry.id === id) return { ...entry, parentPageId: null, path: [], deletedAt: null, trashedWith: null };
      if (detach && pathDescendants.has(entry.id)) return { ...entry, notebookId, deletedAt: null, trashedWith: null };
      return { ...entry, deletedAt: null, trashedWith: null };
    }),
  };
}

export function withRestoredNotebook(state: WorkspaceState, id: string): WorkspaceState {
  if (!state.notebooks.some((notebook) => notebook.id === id)) return state;
  const revived = restoreNotebookChain(state.notebooks, id);
  for (const notebook of state.notebooks) {
    if (notebook.trashedWith === id && notebook.deletedAt) revived.add(notebook.id);
  }
  return {
    notebooks: reviveNotebooks(state.notebooks, revived),
    pages: state.pages.map((page) =>
      page.trashedWith === id ? { ...page, deletedAt: null, trashedWith: null } : page
    ),
  };
}

export function withRestoredNotebookChain(state: WorkspaceState, notebookId: string | null | undefined): WorkspaceState {
  return {
    notebooks: reviveNotebooks(state.notebooks, restoreNotebookChain(state.notebooks, notebookId)),
    pages: state.pages,
  };
}

export function withArchivePlan(state: WorkspaceState, plan: ArchivePlan): WorkspaceState {
  const notebookPatches = new Map<string, Record<string, unknown>>();
  for (const op of plan.notebooks) {
    notebookPatches.set(op.id, { ...(notebookPatches.get(op.id) ?? {}), ...op.patch });
  }
  const pagePatches = new Map<string, Record<string, unknown>>();
  for (const op of plan.pages) {
    pagePatches.set(op.id, { ...(pagePatches.get(op.id) ?? {}), ...op.patch });
  }
  return {
    notebooks: state.notebooks.map((notebook) => {
      const patch = notebookPatches.get(notebook.id);
      return patch ? ({ ...notebook, ...patch } as UsageNotebook) : notebook;
    }),
    pages: state.pages.map((page) => {
      const patch = pagePatches.get(page.id);
      return patch ? ({ ...page, ...patch } as UsagePage) : page;
    }),
  };
}

export function withPagePatch(
  state: WorkspaceState,
  id: string,
  patch: Partial<Pick<UsagePage, "notebookId" | "parentPageId" | "archived" | "deletedAt" | "path">>
): WorkspaceState {
  return {
    notebooks: state.notebooks,
    pages: state.pages.map((page) => (page.id === id ? { ...page, ...patch } : page)),
  };
}

export function withNotebookPatch(
  state: WorkspaceState,
  id: string,
  patch: Partial<Pick<UsageNotebook, "parentId" | "archived" | "archivedFromParentId" | "deletedAt">>
): WorkspaceState {
  return {
    notebooks: state.notebooks.map((notebook) => (notebook.id === id ? { ...notebook, ...patch } : notebook)),
    pages: state.pages,
  };
}

export function hasStructuralLimits(limits: PlanLimits): boolean {
  return (
    limits.pages !== null ||
    limits.notebooksPerPage !== null ||
    limits.notesPerNotebook !== null ||
    limits.subnotesPerNote !== null
  );
}

export class GrowthTracker {
  private state: WorkspaceState;

  constructor(
    state: WorkspaceState,
    private readonly limits: PlanLimits
  ) {
    this.state = state;
  }

  private assert(next: WorkspaceState) {
    const violation = firstGrowthViolation(this.state, next, this.limits);
    if (violation) throw PlanError.limit(violation);
  }

  checkNotebook(parentId: string | null) {
    this.assert(withNewNotebook(this.state, parentId));
  }

  addNotebook(id: string, parentId: string | null) {
    this.state = {
      notebooks: [...this.state.notebooks, { id, parentId, archived: false, deletedAt: null }],
      pages: this.state.pages,
    };
  }

  checkPage(notebookId: string | null, parentPageId: string | null) {
    this.assert(withNewPage(this.state, { notebookId, parentPageId }));
  }

  addPage(id: string, notebookId: string | null, parentPageId: string | null) {
    this.state = {
      notebooks: this.state.notebooks,
      pages: [...this.state.pages, { id, notebookId, parentPageId, archived: false, deletedAt: null }],
    };
  }
}

export interface RestoreNotebookInput {
  id?: unknown;
  parentId?: unknown;
  deletedAt?: unknown;
  trashedWith?: unknown;
}

export interface RestorePageInput {
  id?: unknown;
  notebookId?: unknown;
  parentPageId?: unknown;
  path?: unknown;
  archived?: unknown;
  deletedAt?: unknown;
  trashedWith?: unknown;
}

export interface GoalState {
  id: string;
  archived: boolean;
}

function optionalId(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function deletedFlag(value: unknown): number | null {
  return value ? 1 : null;
}

export function restoredWorkspaceState(
  current: WorkspaceState,
  notebooks: RestoreNotebookInput[],
  pages: RestorePageInput[],
  clean: boolean
): WorkspaceState {
  const notebookMap = new Map<string, UsageNotebook>(
    (clean ? [] : current.notebooks).map((notebook) => [notebook.id, notebook])
  );
  for (const entry of notebooks) {
    const id = optionalId(entry?.id);
    if (!id) continue;
    const previous = notebookMap.get(id);
    notebookMap.set(id, {
      ...(previous ?? { id }),
      id,
      parentId: optionalId(entry.parentId),
      deletedAt: deletedFlag(entry.deletedAt),
      trashedWith: optionalId(entry.trashedWith),
    });
  }
  const pageMap = new Map<string, UsagePage>((clean ? [] : current.pages).map((page) => [page.id, page]));
  for (const entry of pages) {
    const id = optionalId(entry?.id);
    if (!id) continue;
    pageMap.set(id, {
      id,
      notebookId: optionalId(entry.notebookId),
      parentPageId: optionalId(entry.parentPageId),
      path: Array.isArray(entry.path) ? entry.path.filter((item): item is string => typeof item === "string") : [],
      archived: entry.archived === true,
      deletedAt: deletedFlag(entry.deletedAt),
      trashedWith: optionalId(entry.trashedWith),
    });
  }
  return { notebooks: [...notebookMap.values()], pages: [...pageMap.values()] };
}

export function restoredGoals(current: GoalState[], restored: Array<{ id?: unknown; archived?: unknown }>, clean: boolean): GoalState[] {
  const map = new Map<string, GoalState>((clean ? [] : current).map((goal) => [goal.id, goal]));
  for (const entry of restored) {
    const id = optionalId(entry?.id);
    if (!id) continue;
    const previous = map.get(id);
    map.set(id, {
      id,
      archived: typeof entry.archived === "boolean" ? entry.archived : (previous?.archived ?? false),
    });
  }
  return [...map.values()];
}

export function activeGoalCount(goals: Array<{ archived?: boolean }>): number {
  return goals.filter((goal) => !goal.archived).length;
}

export function restoreGrowthViolation(input: {
  limits: PlanLimits;
  current: WorkspaceState;
  currentGoals: GoalState[];
  notebooks: RestoreNotebookInput[];
  pages: RestorePageInput[];
  goals: Array<{ id?: unknown; archived?: unknown }>;
  clean: boolean;
}): LimitViolation | null {
  const after = restoredWorkspaceState(input.current, input.notebooks, input.pages, input.clean);
  const structural = firstGrowthViolation(input.current, after, input.limits);
  if (structural) return structural;
  return goalGrowthViolation(
    activeGoalCount(input.currentGoals),
    activeGoalCount(restoredGoals(input.currentGoals, input.goals, input.clean)),
    input.limits.activeGoals
  );
}
