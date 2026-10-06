"use client";

import { useMemo } from "react";
import { useWorkspace } from "@/lib/data/provider";
import { useStudy } from "@/lib/study/provider";
import type { ArchivePlan } from "@/lib/data/archive";
import { CATALOG_PLANS, catalogFeatures, type FeatureKey } from "./definitions";
import type { Entitlements } from "./entitlements";
import type { LimitViolation, PlanErrorDetail } from "./errors";
import { currentEntitlements, useEntitlements } from "./client";
import { planErrorText, planNameKey, planTranslate } from "./i18n";
import { useTranslation } from "@/lib/i18n/translations";
import {
  archivePlanCheck,
  duplicateNotebookCheck,
  duplicatePageCheck,
  featureCheck,
  limitDetail,
  restoreDatabaseCheck,
  restoreNotebookCheck,
  restorePageCheck,
  writeCheck,
  type CheckState,
} from "./checks";
import { goalGrowthViolation, newNotebookViolation, newPageViolation, usageIndexOf } from "./usage";

export interface PlanGate {
  allowed: boolean;
  reason: string | null;
  badge: string | null;
}

export const OPEN_GATE: PlanGate = { allowed: true, reason: null, badge: null };

export interface NoteTarget {
  notebookId: string | null;
  parentPageId: string | null;
}

export function planNoteTarget<T extends NoteTarget>(
  target: T,
  entitlements: Entitlements = currentEntitlements()
): T {
  return target.parentPageId && entitlements.limits.subnotesPerNote === 0 ? { ...target, parentPageId: null } : target;
}

export interface PlanGates {
  entitlements: Entitlements;
  noteTarget<T extends NoteTarget>(target: T): T;
  readOnly: boolean;
  write: PlanGate;
  feature(key: FeatureKey): PlanGate;
  detail(detail: PlanErrorDetail | null): PlanGate;
  limit(violation: LimitViolation | null): PlanGate;
  newNotebook(parentId: string | null): PlanGate;
  newPage(target: { notebookId?: string | null; parentPageId?: string | null }): PlanGate;
  duplicatePage(id: string): PlanGate;
  duplicateNotebook(id: string): PlanGate;
  archive(plan: ArchivePlan | null): PlanGate;
  restorePage(id: string): PlanGate;
  restoreNotebook(id: string): PlanGate;
  restoreDatabase(notebookId: string | null | undefined): PlanGate;
}

function cheapestPlanWith(feature: FeatureKey): (typeof CATALOG_PLANS)[number] | null {
  return CATALOG_PLANS.find((plan) => plan !== "free" && catalogFeatures(plan)[feature]) ?? null;
}

export function buildPlanGates(entitlements: Entitlements, state: CheckState, language: string): PlanGates {
  const tp = (key: Parameters<typeof planTranslate>[1]) => planTranslate(language, key);

  const detail = (value: PlanErrorDetail | null): PlanGate => {
    if (!value) return OPEN_GATE;
    const reason = planErrorText(value, language, entitlements.features.archive);
    if (value.code === "read_only") return { allowed: false, reason, badge: tp("badge_read_only") };
    if (value.code === "limit") return { allowed: false, reason, badge: tp("lock_limit") };
    if (value.code === "feature" && value.feature) {
      const plan = cheapestPlanWith(value.feature);
      return { allowed: false, reason, badge: plan ? tp(planNameKey(plan)) : null };
    }
    return { allowed: false, reason, badge: null };
  };

  const index = () => usageIndexOf(state);
  const write = detail(writeCheck(entitlements));

  return {
    entitlements,
    noteTarget: (target) => planNoteTarget(target, entitlements),
    readOnly: entitlements.readOnly,
    write,
    feature: (key) => detail(featureCheck(entitlements, key)),
    detail,
    limit: (violation) => detail(limitDetail(violation)),
    newNotebook: (parentId) =>
      write.allowed ? detail(limitDetail(newNotebookViolation(index(), entitlements.limits, parentId))) : write,
    newPage: (target) =>
      write.allowed ? detail(limitDetail(newPageViolation(index(), entitlements.limits, target))) : write,
    duplicatePage: (id) => detail(duplicatePageCheck(entitlements, state, id)),
    duplicateNotebook: (id) => detail(duplicateNotebookCheck(entitlements, state, id)),
    archive: (plan) => (plan ? detail(archivePlanCheck(entitlements, state, plan)) : detail(featureCheck(entitlements, "archive"))),
    restorePage: (id) => detail(restorePageCheck(entitlements, state, id)),
    restoreNotebook: (id) => detail(restoreNotebookCheck(entitlements, state, id)),
    restoreDatabase: (notebookId) => detail(restoreDatabaseCheck(entitlements, state, notebookId)),
  };
}

export function usePlanGates(): PlanGates {
  const { allNotebooks, pages } = useWorkspace();
  const entitlements = useEntitlements();
  const { language } = useTranslation();
  return useMemo(
    () => buildPlanGates(entitlements, { notebooks: allNotebooks, pages }, language),
    [allNotebooks, entitlements, language, pages]
  );
}

export interface GoalGates {
  newGoal: PlanGate;
  archive: PlanGate;
  unarchive: PlanGate;
  awards: PlanGate;
  activeGoals: number;
}

export function buildGoalGates(entitlements: Entitlements, activeGoals: number, language: string): GoalGates {
  const gates = buildPlanGates(entitlements, { notebooks: [], pages: [] }, language);
  const capacity = gates.limit(goalGrowthViolation(activeGoals, activeGoals + 1, entitlements.limits.activeGoals));
  const archive = gates.feature("goalArchive");
  return {
    newGoal: gates.write.allowed ? capacity : gates.write,
    archive,
    unarchive: !archive.allowed || entitlements.readOnly ? archive : capacity,
    awards: gates.feature("awards"),
    activeGoals,
  };
}

export function useGoalGates(): GoalGates {
  const { plans } = useStudy();
  const entitlements = useEntitlements();
  const { language } = useTranslation();
  const activeGoals = plans.filter((plan) => !plan.archived).length;
  return useMemo(() => buildGoalGates(entitlements, activeGoals, language), [activeGoals, entitlements, language]);
}
