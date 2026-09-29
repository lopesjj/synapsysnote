import type { AppDatabase, PropertyDef, PropertyValue } from "@/types/models";
import { canonicalDatabaseKey, isPlanningName } from "@/components/database/database-i18n";
import type { DayKey } from "@/types/study";

export type TaskState = "todo" | "doing" | "done";

export interface PlanningTask {
  id: string;
  databaseId: string;
  title: string;
  day: DayKey | null;
  state: TaskState;
  done: boolean;
  status: string | null;
  color: string | null;
  values: Record<string, PropertyValue>;
  order: number;
}

export interface TaskDraft {
  title: string;
  day: DayKey | null;
  state: TaskState;
}

const STATE_KEYS: Record<TaskState, string> = { todo: "a_fazer", doing: "fazendo", done: "concluido" };
const STATE_INDEX: Record<TaskState, number> = { todo: 0, doing: 1, done: 2 };

export function planningDatabases(databases: readonly AppDatabase[]): AppDatabase[] {
  return databases
    .filter((database) => !database.deletedAt && isPlanningName(database.name))
    .sort((a, b) => b.rows.length - a.rows.length || a.createdAt - b.createdAt);
}

export function findPlanningDatabase(databases: readonly AppDatabase[]): AppDatabase | null {
  return planningDatabases(databases)[0] ?? null;
}

function titleProperty(database: AppDatabase): PropertyDef | undefined {
  return database.properties.find((property) => property.type === "title");
}

function dateProperty(database: AppDatabase): PropertyDef | undefined {
  return database.properties.find((property) => property.type === "date");
}

function statusProperty(database: AppDatabase): PropertyDef | undefined {
  return (
    database.properties.find((property) => property.type === "select" && canonicalDatabaseKey(property.name) === "status") ??
    database.properties.find((property) => property.type === "select")
  );
}

function stateOf(statusText: string | null, options: readonly { name: string }[]): TaskState {
  if (!statusText) return "todo";
  const key = canonicalDatabaseKey(statusText);
  if (key === STATE_KEYS.done) return "done";
  if (key === STATE_KEYS.doing) return "doing";
  if (key === STATE_KEYS.todo) return "todo";
  const index = options.findIndex((option) => option.name === statusText);
  if (options.length >= 3 && index === options.length - 1) return "done";
  return index > 0 ? "doing" : "todo";
}

function dayOf(value: PropertyValue | undefined): DayKey | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

export function planningTasks(database: AppDatabase | null): PlanningTask[] {
  if (!database) return [];
  const title = titleProperty(database);
  const date = dateProperty(database);
  const status = statusProperty(database);
  const options = status?.options ?? [];
  const tasks: PlanningTask[] = [];
  for (const row of database.rows) {
    const text = title && typeof row.values[title.id] === "string" ? (row.values[title.id] as string).trim() : "";
    const day = date ? dayOf(row.values[date.id]) : null;
    if (!text && !day) continue;
    const statusValue = status ? row.values[status.id] : null;
    const statusText = typeof statusValue === "string" && statusValue ? statusValue : null;
    const state = stateOf(statusText, options);
    tasks.push({
      id: row.id,
      databaseId: database.id,
      title: text,
      day,
      state,
      done: state === "done",
      status: statusText,
      color: options.find((option) => option.name === statusText)?.color ?? null,
      values: row.values,
      order: row.order,
    });
  }
  return tasks.sort((a, b) => a.order - b.order);
}

export function statusName(database: AppDatabase, state: TaskState): string | null {
  const status = statusProperty(database);
  const options = status?.options ?? [];
  if (!options.length) return null;
  const match = options.find((option) => canonicalDatabaseKey(option.name) === STATE_KEYS[state]);
  if (match) return match.name;
  const index = state === "done" ? options.length - 1 : Math.min(STATE_INDEX[state], options.length - 1);
  return options[index]?.name ?? null;
}

export function taskValues(
  database: AppDatabase,
  draft: TaskDraft,
  base: Record<string, PropertyValue> = {}
): Record<string, PropertyValue> {
  const values: Record<string, PropertyValue> = { ...base };
  const titleProp = titleProperty(database);
  const dateProp = dateProperty(database);
  const statusProp = statusProperty(database);
  if (titleProp) values[titleProp.id] = draft.title.replace(/\s+/g, " ").trim().slice(0, 300);
  if (dateProp) values[dateProp.id] = draft.day ?? null;
  const status = statusProp ? statusName(database, draft.state) : null;
  if (statusProp && status) values[statusProp.id] = status;
  return values;
}

export function canHoldDates(database: AppDatabase): boolean {
  return Boolean(dateProperty(database) && titleProperty(database));
}
