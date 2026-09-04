/**
 * Checks for the sidebar's drag-and-drop resolution.
 *
 * Browser drag automation is unreliable enough that it cannot tell a broken
 * drop from a mis-synthesised gesture, so the decision layer is asserted
 * directly here. The case that motivated it: a notebook drag resolving to a
 * *page* inside the target, because an expanded notebook's page list is far
 * taller than its own header row.
 *
 * Run with: npm run verify:sidebar-dnd
 */

import assert from "node:assert/strict";
import { encodeId, planSidebarDrop } from "../src/components/layout/sidebar-dnd";
import type { Notebook, Page } from "../src/types/models";

function notebook(id: string, order: number): Notebook {
  return { id, name: id, order, createdAt: 0, updatedAt: 0 };
}

function page(
  id: string,
  notebookId: string | null,
  parentPageId: string | null,
  order: number,
  path: string[] = []
): Page {
  return {
    id,
    title: id,
    notebookId,
    parentPageId,
    path,
    blocks: [],
    plainText: "",
    extractedOCRText: "",
    transcriptText: "",
    tags: [],
    outgoingLinks: [],
    backlinks: [],
    favorite: false,
    archived: false,
    deletedAt: null,
    createdBy: "u",
    updatedBy: "u",
    createdAt: 0,
    updatedAt: 0,
    order,
  };
}

/**
 *   work                       personal
 *     plan            (0)        journal   (0)
 *       meeting       (0)
 *       retro         (1)
 *     tasks           (1)
 */
const snapshot = {
  notebooks: [notebook("work", 0), notebook("personal", 100), notebook("archive", 200)],
  pages: [
    page("plan", "work", null, 0),
    page("meeting", "work", "plan", 0, ["plan"]),
    page("retro", "work", "plan", 100, ["plan"]),
    page("tasks", "work", null, 100),
    page("journal", "personal", null, 0),
  ],
};

const nb = (id: string) => encodeId("notebook", id);
const pg = (id: string) => encodeId("page", id);

function check(name: string, run: () => void) {
  run();
  console.log(`  ${name}`);
}

check("a notebook dropped on another notebook reorders the list", () => {
  const plan = planSidebarDrop(nb("work"), nb("archive"), snapshot);
  assert.deepEqual(plan, {
    kind: "reorder-notebooks",
    notebookIds: ["personal", "archive", "work"],
  });
});

check("a notebook dropped on a page reorders to that page's notebook", () => {
  // The regression: an expanded notebook's pages cover most of its height, so
  // this is the common outcome of a real notebook drag.
  const plan = planSidebarDrop(nb("archive"), pg("meeting"), snapshot);
  assert.deepEqual(plan, {
    kind: "reorder-notebooks",
    notebookIds: ["archive", "work", "personal"],
  });
});

check("a notebook dropped on a page of its own notebook is a no-op", () => {
  assert.equal(planSidebarDrop(nb("work"), pg("meeting"), snapshot), null);
});

check("a page dropped on a notebook header moves it to that notebook's root", () => {
  const plan = planSidebarDrop(pg("meeting"), nb("personal"), snapshot);
  assert.deepEqual(plan, {
    kind: "move-page",
    pageId: "meeting",
    notebookId: "personal",
    parentPageId: null,
    // Appended after the notebook's existing root pages.
    pageIds: ["journal", "meeting"],
  });
});

check("a page already at that notebook's root is a no-op", () => {
  assert.equal(planSidebarDrop(pg("tasks"), nb("work"), snapshot), null);
});

check("a page dropped on a sibling reorders within the parent", () => {
  const plan = planSidebarDrop(pg("retro"), pg("meeting"), snapshot);
  assert.deepEqual(plan, { kind: "reorder-pages", pageIds: ["retro", "meeting"] });
});

check("a page dropped on a page in another notebook re-parents and places it", () => {
  const plan = planSidebarDrop(pg("journal"), pg("retro"), snapshot);
  assert.deepEqual(plan, {
    kind: "move-page",
    pageId: "journal",
    notebookId: "work",
    parentPageId: "plan",
    // Lands immediately before the row it was dropped on.
    pageIds: ["meeting", "journal", "retro"],
  });
});

check("a page cannot be dropped into its own subtree", () => {
  assert.equal(planSidebarDrop(pg("plan"), pg("meeting"), snapshot), null);
});

check("a stale materialised path still blocks a cyclic move", () => {
  // `path` is written asynchronously, so the parent chain has to be walked too.
  const stale = {
    ...snapshot,
    pages: snapshot.pages.map((candidate) =>
      candidate.id === "meeting" ? { ...candidate, path: [] } : candidate
    ),
  };
  assert.equal(planSidebarDrop(pg("plan"), pg("meeting"), stale), null);
});

check("dropping on itself, on nothing, or on an unknown id is a no-op", () => {
  assert.equal(planSidebarDrop(nb("work"), nb("work"), snapshot), null);
  assert.equal(planSidebarDrop(nb("work"), null, snapshot), null);
  assert.equal(planSidebarDrop(nb("work"), undefined, snapshot), null);
  assert.equal(planSidebarDrop(pg("plan"), "garbage", snapshot), null);
  assert.equal(planSidebarDrop(pg("ghost"), nb("personal"), snapshot), null);
});

check("ids containing a colon survive the round trip", () => {
  const odd = {
    notebooks: [notebook("a:b", 0), notebook("c", 100)],
    pages: [],
  };
  assert.deepEqual(planSidebarDrop(nb("a:b"), nb("c"), odd), {
    kind: "reorder-notebooks",
    notebookIds: ["c", "a:b"],
  });
});

console.log("all sidebar drag-and-drop checks passed");
