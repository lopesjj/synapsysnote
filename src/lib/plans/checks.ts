import type { ArchivePlan } from "@/lib/data/archive";
import { blocksContainVideo, type FeatureKey } from "./definitions";
import type { Entitlements } from "./entitlements";
import type { LimitViolation, PlanErrorDetail } from "./errors";
import {
  firstGrowthViolation,
  withArchivePlan,
  withDuplicatedNotebook,
  withDuplicatedPage,
  withRestoredNotebook,
  withRestoredNotebookChain,
  withRestoredPage,
  type UsageNotebook,
  type UsagePage,
  type WorkspaceState,
} from "./usage";

export interface CheckPage extends UsagePage {
  blocks?: unknown;
}

export interface CheckState {
  notebooks: UsageNotebook[];
  pages: CheckPage[];
}

const READ_ONLY: PlanErrorDetail = { code: "read_only", violation: null, feature: null };

export function writeCheck(entitlements: Entitlements): PlanErrorDetail | null {
  return entitlements.readOnly ? READ_ONLY : null;
}

export function featureCheck(entitlements: Entitlements, feature: FeatureKey): PlanErrorDetail | null {
  if (entitlements.features[feature]) return null;
  return entitlements.readOnly ? READ_ONLY : { code: "feature", violation: null, feature };
}

export function limitDetail(violation: LimitViolation | null): PlanErrorDetail | null {
  return violation ? { code: "limit", violation, feature: null } : null;
}

export function growthCheck(
  entitlements: Entitlements,
  state: WorkspaceState,
  next: (current: WorkspaceState) => WorkspaceState
): PlanErrorDetail | null {
  if (entitlements.readOnly) return READ_ONLY;
  return limitDetail(firstGrowthViolation(state, next(state), entitlements.limits));
}

function parentIdOf(notebook: Pick<UsageNotebook, "parentId">): string | null {
  return notebook.parentId && notebook.parentId !== "null" ? notebook.parentId : null;
}

export function pageTreeIds(pages: UsagePage[], rootIds: string[]): Set<string> {
  const ids = new Set(rootIds);
  const stack = [...rootIds];
  while (stack.length) {
    const current = stack.pop()!;
    for (const page of pages) {
      if (page.parentPageId === current && !ids.has(page.id)) {
        ids.add(page.id);
        stack.push(page.id);
      }
    }
  }
  return ids;
}

export function notebookTreeIds(notebooks: UsageNotebook[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const notebook of notebooks) {
      const parentId = parentIdOf(notebook);
      if (parentId && ids.has(parentId) && !ids.has(notebook.id)) {
        ids.add(notebook.id);
        added = true;
      }
    }
  }
  return ids;
}

function pagesHaveVideo(pages: CheckPage[], ids: Set<string>): boolean {
  return pages.some((page) => ids.has(page.id) && !page.deletedAt && blocksContainVideo(page.blocks));
}

function videoCheck(entitlements: Entitlements, hasVideo: () => boolean): PlanErrorDetail | null {
  if (entitlements.features.video || !hasVideo()) return null;
  return featureCheck(entitlements, "video");
}

export function duplicatePageCheck(entitlements: Entitlements, state: CheckState, id: string): PlanErrorDetail | null {
  return (
    writeCheck(entitlements) ??
    videoCheck(entitlements, () => {
      const pages = state.pages.filter((page) => !page.deletedAt);
      return pagesHaveVideo(pages, pageTreeIds(pages, [id]));
    }) ??
    growthCheck(entitlements, state, (current) => withDuplicatedPage(current, id))
  );
}

export function duplicateNotebookCheck(
  entitlements: Entitlements,
  state: CheckState,
  id: string
): PlanErrorDetail | null {
  return (
    writeCheck(entitlements) ??
    videoCheck(entitlements, () => {
      const notebookIds = notebookTreeIds(
        state.notebooks.filter((notebook) => !notebook.deletedAt),
        id
      );
      const pages = state.pages.filter((page) => !page.deletedAt);
      const roots = pages.filter((page) => page.notebookId && notebookIds.has(page.notebookId)).map((page) => page.id);
      return pagesHaveVideo(pages, pageTreeIds(pages, roots));
    }) ??
    growthCheck(entitlements, state, (current) => withDuplicatedNotebook(current, id))
  );
}

export function archivePlanCheck(
  entitlements: Entitlements,
  state: WorkspaceState,
  plan: ArchivePlan
): PlanErrorDetail | null {
  const blocked = featureCheck(entitlements, "archive");
  if (blocked) return blocked;
  if (plan.intent !== "unarchive" || entitlements.readOnly) return null;
  return limitDetail(firstGrowthViolation(state, withArchivePlan(state, plan), entitlements.limits));
}

function restoreCheck(
  entitlements: Entitlements,
  state: WorkspaceState,
  next: (current: WorkspaceState) => WorkspaceState
): PlanErrorDetail | null {
  if (entitlements.readOnly) return null;
  return limitDetail(firstGrowthViolation(state, next(state), entitlements.limits));
}

export function restorePageCheck(entitlements: Entitlements, state: WorkspaceState, id: string): PlanErrorDetail | null {
  return restoreCheck(entitlements, state, (current) => withRestoredPage(current, id));
}

export function restoreNotebookCheck(
  entitlements: Entitlements,
  state: WorkspaceState,
  id: string
): PlanErrorDetail | null {
  return restoreCheck(entitlements, state, (current) => withRestoredNotebook(current, id));
}

export function restoreDatabaseCheck(
  entitlements: Entitlements,
  state: WorkspaceState,
  notebookId: string | null | undefined
): PlanErrorDetail | null {
  return restoreCheck(entitlements, state, (current) => withRestoredNotebookChain(current, notebookId));
}
