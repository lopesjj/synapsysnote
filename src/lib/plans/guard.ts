"use client";

import type { DataAdapter, DuplicateOptions, PlanOperation } from "@/lib/data/adapter";
import type { AppDatabase, Notebook, Page } from "@/types/models";
import { isVideoMedia, type FeatureKey } from "./definitions";
import type { Entitlements } from "./entitlements";
import { PlanError, type PlanErrorDetail } from "./errors";
import { currentEntitlements, planFailure, usePlanStore, waitForPlan } from "./client";
import {
  archivePlanCheck,
  duplicateNotebookCheck,
  duplicatePageCheck,
  featureCheck,
  growthCheck,
  restoreDatabaseCheck,
  restoreNotebookCheck,
  restorePageCheck,
  writeCheck,
} from "./checks";
import {
  withMovedNotebook,
  withMovedPage,
  withNewNotebook,
  withNewPage,
  withNotebookPatch,
  withPagePatch,
  type WorkspaceState,
} from "./usage";

export interface GuardSnapshot {
  notebooks: Notebook[];
  pages: Page[];
  databases: AppDatabase[];
}

const ARCHIVE_NOTEBOOK_KEYS = new Set(["archived", "parentId", "archivedFromParentId"]);
const ARCHIVE_PAGE_KEYS = new Set([
  "archived",
  "notebookId",
  "parentPageId",
  "path",
  "archivedFromNotebookId",
  "archivedFromParentPageId",
  "archivedFromPath",
]);

function onlyKeys(patch: object, allowed: Set<string>): boolean {
  return Object.keys(patch).every((key) => allowed.has(key));
}

function enforce(detail: PlanErrorDetail | null) {
  if (detail) throw planFailure(new PlanError(detail));
}

export function createPlanGuard(base: DataAdapter, snapshot: () => GuardSnapshot): DataAdapter {
  const state = (): WorkspaceState => {
    const current = snapshot();
    return { notebooks: current.notebooks, pages: current.pages };
  };

  const guarded = <T>(check: (entitlements: Entitlements) => void, run: () => Promise<T>): Promise<T> => {
    const execute = () => {
      check(currentEntitlements());
      return run();
    };
    if (!usePlanStore.getState().loaded) return waitForPlan().then(execute);
    try {
      return execute();
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const writable = (entitlements: Entitlements) => enforce(writeCheck(entitlements));

  const feature = (entitlements: Entitlements, key: FeatureKey) => enforce(featureCheck(entitlements, key));

  const growth = (entitlements: Entitlements, next: (current: WorkspaceState) => WorkspaceState) =>
    enforce(growthCheck(entitlements, state(), next));

  const uploadCheck = (file: { name?: string; type?: string }) => (entitlements: Entitlements) => {
    writable(entitlements);
    if (isVideoMedia(file)) feature(entitlements, "video");
  };

  const duplicateOptions = (entitlements: Entitlements, options?: DuplicateOptions): DuplicateOptions => ({
    ...options,
    includeFlashcards: (options?.includeFlashcards ?? true) && entitlements.features.flashcards,
  });

  const overrides: Partial<DataAdapter> = {
    assertPlan(operation: PlanOperation) {
      return guarded(
        (entitlements) => enforce(archivePlanCheck(entitlements, state(), operation.plan)),
        async () => undefined
      );
    },
    createNotebook(input) {
      return guarded(
        (entitlements) => {
          writable(entitlements);
          growth(entitlements, (current) => withNewNotebook(current, input.parentId ?? null));
        },
        () => base.createNotebook(input)
      );
    },
    createPage(input) {
      return guarded(
        (entitlements) => {
          writable(entitlements);
          growth(entitlements, (current) =>
            withNewPage(current, { notebookId: input.notebookId ?? null, parentPageId: input.parentPageId ?? null })
          );
        },
        () => base.createPage(input)
      );
    },
    duplicatePage(id, options) {
      let resolved: DuplicateOptions = options ?? {};
      return guarded(
        (entitlements) => {
          enforce(duplicatePageCheck(entitlements, snapshot(), id));
          resolved = duplicateOptions(entitlements, options);
        },
        () => base.duplicatePage(id, resolved)
      );
    },
    duplicateNotebook(id, options) {
      let resolved: DuplicateOptions = options ?? {};
      return guarded(
        (entitlements) => {
          enforce(duplicateNotebookCheck(entitlements, snapshot(), id));
          resolved = duplicateOptions(entitlements, options);
        },
        () => base.duplicateNotebook(id, resolved)
      );
    },
    updateNotebook(id, patch) {
      return guarded(
        (entitlements) => {
          if ("archived" in patch) {
            feature(entitlements, "archive");
            if (entitlements.readOnly && !onlyKeys(patch, ARCHIVE_NOTEBOOK_KEYS)) throw planFailure(PlanError.readOnly());
            return;
          }
          writable(entitlements);
          if ("parentId" in patch) {
            growth(entitlements, (current) => withNotebookPatch(current, id, { parentId: patch.parentId ?? null }));
          }
        },
        () => base.updateNotebook(id, patch)
      );
    },
    updatePage(id, patch, options) {
      return guarded(
        (entitlements) => {
          if ("archived" in patch) {
            feature(entitlements, "archive");
            if (entitlements.readOnly && !onlyKeys(patch, ARCHIVE_PAGE_KEYS)) throw planFailure(PlanError.readOnly());
            return;
          }
          writable(entitlements);
          if ("notebookId" in patch || "parentPageId" in patch) {
            growth(entitlements, (current) =>
              withPagePatch(current, id, {
                ...("notebookId" in patch ? { notebookId: patch.notebookId ?? null } : {}),
                ...("parentPageId" in patch ? { parentPageId: patch.parentPageId ?? null } : {}),
              })
            );
          }
        },
        () => base.updatePage(id, patch, options)
      );
    },
    moveNotebook(id, target) {
      return guarded(
        (entitlements) => {
          writable(entitlements);
          growth(entitlements, (current) => withMovedNotebook(current, id, target.parentId));
        },
        () => base.moveNotebook(id, target)
      );
    },
    movePage(id, target) {
      return guarded(
        (entitlements) => {
          writable(entitlements);
          growth(entitlements, (current) => withMovedPage(current, id, target));
        },
        () => base.movePage(id, target)
      );
    },
    applyPageOrders(updates) {
      return guarded(writable, () => base.applyPageOrders(updates));
    },
    applyNotebookOrders(updates) {
      return guarded(writable, () => base.applyNotebookOrders(updates));
    },
    restorePage(id) {
      return guarded(
        (entitlements) => enforce(restorePageCheck(entitlements, state(), id)),
        () => base.restorePage(id)
      );
    },
    restoreNotebook(id) {
      return guarded(
        (entitlements) => enforce(restoreNotebookCheck(entitlements, state(), id)),
        () => base.restoreNotebook(id)
      );
    },
    restoreDatabase(id) {
      return guarded(
        (entitlements) => {
          const database = snapshot().databases.find((entry) => entry.id === id);
          if (database) enforce(restoreDatabaseCheck(entitlements, state(), database.notebookId));
        },
        () => base.restoreDatabase(id)
      );
    },
    snapshotVersion(pageId, label) {
      return guarded(writable, () => base.snapshotVersion(pageId, label));
    },
    restoreVersion(pageId, versionId) {
      return guarded(writable, () => base.restoreVersion(pageId, versionId));
    },
    createDatabase(input) {
      return guarded(writable, () => base.createDatabase(input));
    },
    updateDatabase(id, patch) {
      return guarded(writable, () => base.updateDatabase(id, patch));
    },
    upsertRow(databaseId, row) {
      return guarded(writable, () => base.upsertRow(databaseId, row));
    },
    patchRowValues(databaseId, rowId, values) {
      return guarded(writable, () => base.patchRowValues(databaseId, rowId, values));
    },
    createImportJob(input) {
      return guarded(writable, () => base.createImportJob(input));
    },
    saveAudioNote(pageId, blob, durationSeconds) {
      return guarded(writable, () => base.saveAudioNote(pageId, blob, durationSeconds));
    },
    uploadAudioNote(pageId, blob, durationSeconds) {
      return guarded(writable, () => base.uploadAudioNote(pageId, blob, durationSeconds));
    },
    saveAttachment(pageId, file) {
      return guarded(uploadCheck(file), () => base.saveAttachment(pageId, file));
    },
    uploadAttachment(pageId, file, onProgress) {
      return guarded(uploadCheck(file), () => base.uploadAttachment(pageId, file, onProgress));
    },
    uploadWorkspaceIcon(file) {
      return guarded(writable, () => base.uploadWorkspaceIcon(file));
    },
    copyMedia(target, sources) {
      return guarded(writable, () => base.copyMedia(target, sources));
    },
    createFlashcard(input) {
      return guarded((entitlements) => feature(entitlements, "flashcards"), () => base.createFlashcard(input));
    },
    updateFlashcard(id, patch) {
      return guarded((entitlements) => feature(entitlements, "flashcards"), () => base.updateFlashcard(id, patch));
    },
    reviewFlashcard(id, rating, modifier) {
      return guarded((entitlements) => feature(entitlements, "flashcards"), () => base.reviewFlashcard(id, rating, modifier));
    },
    resetFlashcardsProgress(scope) {
      return guarded((entitlements) => feature(entitlements, "flashcards"), () => base.resetFlashcardsProgress(scope));
    },
    uploadFlashcardImage(pageId, cardId, file) {
      return guarded(
        (entitlements) => feature(entitlements, "flashcards"),
        () => base.uploadFlashcardImage(pageId, cardId, file)
      );
    },
  };

  const bound = new Map<PropertyKey, unknown>();
  return new Proxy(base, {
    get(target, property) {
      if (typeof property === "string" && Object.prototype.hasOwnProperty.call(overrides, property)) {
        return overrides[property as keyof DataAdapter];
      }
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      const cached = bound.get(property);
      if (cached) return cached;
      const fn = (value as (...args: unknown[]) => unknown).bind(target);
      bound.set(property, fn);
      return fn;
    },
  });
}
