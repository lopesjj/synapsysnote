"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useWorkspace } from "@/lib/data/provider";
import { translate, useTranslation } from "@/lib/i18n/translations";
import type { AppDatabase, PropertyDef } from "@/types/models";
import {
  canHoldDates,
  planningDatabases,
  planningTasks,
  taskValues,
  type PlanningTask,
  type TaskDraft,
  type TaskState,
} from "./planning-bridge";

let pendingDatabase: Promise<AppDatabase> | null = null;

function usePlanningState() {
  const { databases, adapter } = useWorkspace();
  const { language } = useTranslation();
  const sources = useMemo(() => planningDatabases(databases), [databases]);
  const database = sources[0] ?? null;
  const tasks = useMemo(() => sources.flatMap((source) => planningTasks(source)), [sources]);
  const databaseRef = useRef<AppDatabase | null>(database);
  const sourcesRef = useRef<AppDatabase[]>(sources);

  useEffect(() => {
    databaseRef.current = database;
    sourcesRef.current = sources;
  }, [database, sources]);

  const ensure = useCallback(async (): Promise<AppDatabase> => {
    const current = databaseRef.current;
    if (current && canHoldDates(current)) return current;
    if (current) {
      const additions: PropertyDef[] = [];
      const order = Math.max(0, ...current.properties.map((property) => property.order + 1));
      if (!current.properties.some((property) => property.type === "title")) {
        additions.push({ id: "p_title", name: translate(language, "planning"), type: "title", order, width: 320 });
      }
      if (!current.properties.some((property) => property.type === "date")) {
        additions.push({ id: `p_date_${Date.now().toString(36)}`, name: "Data", type: "date", order: order + 1, width: 140 });
      }
      const properties = [...current.properties, ...additions];
      await adapter.updateDatabase(current.id, { properties });
      const next = { ...current, properties };
      databaseRef.current = next;
      return next;
    }
    if (!pendingDatabase) {
      pendingDatabase = adapter.createDatabase({ name: translate(language, "planning") }).finally(() => {
        window.setTimeout(() => {
          pendingDatabase = null;
        }, 1500);
      });
    }
    const created = await pendingDatabase;
    databaseRef.current = created;
    return created;
  }, [adapter, language]);

  const createTask = useCallback(
    async (draft: TaskDraft) => {
      const target = await ensure();
      await adapter.upsertRow(target.id, { values: taskValues(target, draft), order: Date.now() });
    },
    [adapter, ensure]
  );

  const updateTask = useCallback(
    async (task: PlanningTask, draft: TaskDraft) => {
      const target = sourcesRef.current.find((source) => source.id === task.databaseId) ?? (await ensure());
      const next = taskValues(target, draft);
      const changed = Object.fromEntries(
        Object.entries(next).filter(([key, value]) => JSON.stringify(task.values[key] ?? null) !== JSON.stringify(value ?? null))
      );
      if (Object.keys(changed).length) await adapter.patchRowValues(target.id, task.id, changed);
    },
    [adapter, ensure]
  );

  const setTaskState = useCallback(
    (task: PlanningTask, state: TaskState) => updateTask(task, { title: task.title, day: task.day, state }),
    [updateTask]
  );

  const deleteTask = useCallback((task: PlanningTask) => adapter.deleteRow(task.databaseId, task.id), [adapter]);

  return useMemo(
    () => ({ database, sources, tasks, createTask, updateTask, setTaskState, deleteTask }),
    [createTask, database, deleteTask, setTaskState, sources, tasks, updateTask]
  );
}

type PlanningValue = ReturnType<typeof usePlanningState>;

const PlanningContext = createContext<PlanningValue | null>(null);

export function PlanningProvider({ children }: { children: ReactNode }) {
  const value = usePlanningState();
  return createElement(PlanningContext.Provider, { value }, children);
}

export function usePlanning(): PlanningValue {
  const value = useContext(PlanningContext);
  if (!value) throw new Error("usePlanning precisa estar dentro de <PlanningProvider>");
  return value;
}
