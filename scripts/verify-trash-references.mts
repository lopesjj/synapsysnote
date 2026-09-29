import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import { referencedPaths } from "../src/lib/trash/purge-core";

type Row = { id: string; data: Record<string, unknown> };

function fakeDb(collections: Record<string, Row[]>): Firestore {
  const snapshot = (rows: Row[], scope: string) => ({
    empty: rows.length === 0,
    size: rows.length,
    docs: rows.map((row) => ({
      id: row.id,
      data: () => row.data,
      get: (field: string) => row.data[field],
      ref: { collection: (name: string) => collection(`${scope}/${row.id}/${name}`) },
    })),
  });
  const collection = (name: string) => {
    const rows = () => collections[name] ?? [];
    return {
      select: () => ({ get: async () => snapshot(rows(), name) }),
      get: async () => snapshot(rows(), name),
      where: (field: string, op: string, value: unknown) => {
        const filtered = () =>
          rows().filter((row) => {
            const current = row.data[field] as number;
            return op === ">=" ? current >= (value as number) : op === "<=" ? current <= (value as number) : current === value;
          });
        return {
          get: async () => snapshot(filtered(), name),
          select: () => ({ get: async () => snapshot(filtered(), name) }),
        };
      },
    };
  };
  return { collection: () => ({ doc: () => ({ collection }) }) } as unknown as Firestore;
}

const shared = "https://firebasestorage.googleapis.com/v0/b/app/o/workspaces%2Fws1%2Fuploads%2Ficons%2Flogo.webp?alt=media";
const goalOnly = "https://firebasestorage.googleapis.com/v0/b/app/o/workspaces%2Fws1%2Fuploads%2Ficons%2Fgoal.webp?alt=media";

const db = fakeDb({
  pages: [],
  databases: [],
  notebooks: [{ id: "nb1", data: { emoji: shared } }],
  flashcards: [],
  study_plans: [
    { id: "plan1", data: { icon: goalOnly, updatedAt: 1 } },
    { id: "plan2", data: { icon: "📘", updatedAt: 1 } },
  ],
});

const inUse = await referencedPaths(db, "ws1", { pages: [], databases: [], notebooks: [] });
assert.ok(inUse.has("workspaces/ws1/uploads/icons/goal.webp"), "goal logo must count as in use");
assert.ok(inUse.has("workspaces/ws1/uploads/icons/logo.webp"));
assert.equal(inUse.size, 2);

console.log("verify-trash-references: ok");
