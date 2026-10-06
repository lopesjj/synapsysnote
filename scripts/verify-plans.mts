import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  ALL_FEATURES,
  CATALOG_PLANS,
  DAY_MS,
  FEATURE_KEYS,
  LIMIT_KEYS,
  PAID_PLANS,
  PLAN_FEATURES,
  PLAN_LIMITS,
  READ_ONLY_FEATURES,
  READ_ONLY_GRACE_MS,
  TRIAL_DAYS,
  TRIAL_MS,
  TRIAL_TIER,
  UNLIMITED,
  blocksContainVideo,
  catalogFeatures,
  catalogLimits,
  isVideoBlock,
  isVideoMedia,
  pageContainsVideo,
  withoutVideoBlocks,
  type PlanId,
  type PlanLimits,
} from "../src/lib/plans/definitions";
import {
  daysUntil,
  newPlanRecord,
  nextChangeAt,
  normalizePlanRecord,
  readOnlyAfterOf,
  resolveEntitlements,
  type AccountPlanRecord,
  type Entitlements,
} from "../src/lib/plans/entitlements";
import {
  PlanError,
  isPlanError,
  parsePlanErrorMessage,
  planErrorMessage,
  toPlanError,
  type PlanErrorDetail,
} from "../src/lib/plans/errors";
import {
  GrowthTracker,
  firstGrowthViolation,
  goalGrowthViolation,
  indexUsage,
  measureUsage,
  newNotebookViolation,
  newPageViolation,
  restoreGrowthViolation,
  summarizeUsage,
  usageIndexOf,
  withDuplicatedNotebook,
  withDuplicatedPage,
  withMovedPage,
  withNewNotebook,
  withNewPage,
  type UsageNotebook,
  type UsagePage,
  type WorkspaceState,
} from "../src/lib/plans/usage";
import {
  archivePlanCheck,
  duplicateNotebookCheck,
  duplicatePageCheck,
  featureCheck,
  noteTargetFor,
  restorePageCheck,
  writeCheck,
} from "../src/lib/plans/checks";
import { planArchivePageTree, planUnarchivePageTree } from "../src/lib/data/archive";
import type { DataAdapter } from "../src/lib/data/adapter";
import type { GuardSnapshot } from "../src/lib/plans/guard";
import { PLAN_DICTIONARIES, planErrorText } from "../src/lib/plans/i18n";
import { LEGAL_FACTS, legalPlaceholders, planLimitPlaceholder } from "../src/lib/legal/entity";
import { LEGAL_LOADERS } from "../src/lib/legal/load";
import { LOCALES } from "../src/lib/i18n/locale";
import type { LegalBundle } from "../src/lib/legal/types";
import type { Notebook, Page } from "../src/types/models";

console.log("Verificando planos de conta...");

const NOW = Date.UTC(2026, 9, 6, 12);

function record(plan: PlanId, overrides: Partial<AccountPlanRecord> = {}): AccountPlanRecord {
  const base = newPlanRecord({ uid: "u1", email: "User@Example.com ", plan, now: NOW, source: "signup", updatedBy: null });
  const next = { ...base, ...overrides };
  next.readOnlyAfter = readOnlyAfterOf(next);
  return next;
}

function entitlementsOf(plan: PlanId, overrides: Partial<AccountPlanRecord> = {}, now = NOW): Entitlements {
  return resolveEntitlements(record(plan, overrides), now);
}

{
  assert.deepEqual(PLAN_LIMITS.basic, { pages: 1, notebooksPerPage: 15, notesPerNotebook: 15, subnotesPerNote: 0, activeGoals: 1 });
  assert.deepEqual(PLAN_LIMITS.pro, { pages: 3, notebooksPerPage: 30, notesPerNotebook: 30, subnotesPerNote: 5, activeGoals: 3 });
  assert.deepEqual(PLAN_LIMITS.ultra, { pages: 10, notebooksPerPage: 50, notesPerNotebook: 50, subnotesPerNote: 10, activeGoals: 5 });
  assert.deepEqual(PLAN_LIMITS.owner, UNLIMITED);
  assert.deepEqual(PLAN_FEATURES.basic, {
    video: false,
    transcription: false,
    flashcards: false,
    aiFlashcards: false,
    archive: false,
    goalArchive: false,
    awards: false,
  });
  assert.deepEqual(PLAN_FEATURES.pro, {
    video: true,
    transcription: true,
    flashcards: true,
    aiFlashcards: false,
    archive: true,
    goalArchive: true,
    awards: true,
  });
  assert.deepEqual(PLAN_FEATURES.ultra, ALL_FEATURES);
  assert.deepEqual(PLAN_FEATURES.owner, ALL_FEATURES);
  assert.equal(TRIAL_TIER, "ultra");
  assert.equal(TRIAL_DAYS, 30);
  assert.deepEqual(catalogLimits("free"), PLAN_LIMITS.ultra);
  assert.deepEqual(catalogFeatures("free"), PLAN_FEATURES.ultra);
  for (const plan of CATALOG_PLANS) assert.ok(catalogLimits(plan) && catalogFeatures(plan));
  assert.deepEqual(
    FEATURE_KEYS.filter((key) => READ_ONLY_FEATURES[key]).sort(),
    ["archive", "awards", "goalArchive"],
    "somente leitura libera só arquivar e ver conquistas"
  );
  for (const plan of PAID_PLANS) {
    for (const key of LIMIT_KEYS) {
      const lower = plan === "basic" ? null : PLAN_LIMITS[plan === "pro" ? "basic" : "pro"][key];
      if (lower !== null) assert.ok((PLAN_LIMITS[plan][key] ?? Infinity) >= lower, `${plan}.${key} menor que o plano anterior`);
    }
    for (const key of FEATURE_KEYS) {
      if (plan !== "basic" && PLAN_FEATURES[plan === "pro" ? "basic" : "pro"][key]) {
        assert.ok(PLAN_FEATURES[plan][key], `${plan} perde ${key} do plano anterior`);
      }
    }
  }
}

{
  const fresh = record("free");
  assert.equal(fresh.email, "user@example.com");
  assert.equal(fresh.trialEndsAt - fresh.trialStartedAt, TRIAL_MS);
  assert.equal(fresh.readOnlyAfter, fresh.trialEndsAt);

  const trial = resolveEntitlements(fresh, NOW + 1000);
  assert.equal(trial.status, "trial");
  assert.equal(trial.tier, "ultra");
  assert.equal(trial.readOnly, false);
  assert.deepEqual(trial.limits, PLAN_LIMITS.ultra);
  assert.deepEqual(trial.features, PLAN_FEATURES.ultra);

  const ended = resolveEntitlements(fresh, fresh.trialEndsAt);
  assert.equal(ended.status, "trial_ended");
  assert.equal(ended.readOnly, true);
  assert.deepEqual(ended.features, READ_ONLY_FEATURES);
  assert.deepEqual(ended.limits, UNLIMITED);

  const provisional = resolveEntitlements(null, NOW);
  assert.equal(provisional.provisional, true);
  assert.equal(provisional.readOnly, false);
  assert.deepEqual(provisional.limits, PLAN_LIMITS[TRIAL_TIER]);

  const owner = entitlementsOf("owner", {}, NOW + 10 * TRIAL_MS);
  assert.equal(owner.status, "owner");
  assert.equal(owner.readOnly, false);
  assert.deepEqual(owner.limits, UNLIMITED);
  assert.equal(readOnlyAfterOf(record("owner")), null);

  const basic = entitlementsOf("basic", {}, NOW + 1000);
  assert.equal(basic.status, "active");
  assert.deepEqual(basic.limits, PLAN_LIMITS.basic);
  assert.equal(entitlementsOf("basic", {}, NOW + 10 * TRIAL_MS).readOnly, false, "plano pago sem vencimento não expira");

  const expiring = { expiresAt: NOW + 5 * DAY_MS };
  assert.equal(entitlementsOf("pro", expiring, NOW + 4 * DAY_MS).status, "active");
  const duringTrial = entitlementsOf("pro", expiring, NOW + 6 * DAY_MS);
  assert.equal(duringTrial.status, "trial", "plano vencido dentro do teste volta ao teste");
  assert.deepEqual(duringTrial.limits, PLAN_LIMITS.ultra);
  const expired = entitlementsOf("pro", expiring, NOW + TRIAL_MS + 1);
  assert.equal(expired.status, "expired");
  assert.equal(expired.readOnly, true);

  const records = [
    record("free"),
    record("basic"),
    record("pro", { expiresAt: NOW + 3 * DAY_MS }),
    record("ultra", { expiresAt: NOW + 45 * DAY_MS }),
    record("basic", { expiresAt: NOW - DAY_MS, trialEndsAt: NOW - 2 * DAY_MS }),
    record("owner"),
  ];
  for (const entry of records) {
    for (let offset = -DAY_MS; offset <= 60 * DAY_MS; offset += DAY_MS / 4) {
      const now = NOW + offset;
      const resolved = resolveEntitlements(entry, now);
      const byRules = entry.readOnlyAfter !== null && now >= entry.readOnlyAfter;
      assert.equal(resolved.readOnly, byRules, `${entry.plan}: readOnlyAfter diverge da resolução em ${offset / DAY_MS} dias`);
    }
  }

  const normalized = normalizePlanRecord(
    {
      plan: "free",
      email: " A@B.COM ",
      trialStartedAt: { toMillis: () => NOW },
      expiresAt: NOW + DAY_MS,
      source: "hacker",
    },
    "u2"
  );
  assert.ok(normalized);
  assert.equal(normalized.email, "a@b.com");
  assert.equal(normalized.trialEndsAt, NOW + TRIAL_MS);
  assert.equal(normalized.expiresAt, null, "plano gratuito não tem vencimento");
  assert.equal(normalized.source, "system");
  assert.equal(normalized.readOnlyAfter, NOW + TRIAL_MS);
  assert.equal(normalizePlanRecord({ plan: "platinum" }, "u3"), null);
  assert.equal(normalizePlanRecord(null, "u3"), null);

  assert.equal(nextChangeAt(record("pro", { expiresAt: NOW + 2 * DAY_MS }), NOW), NOW + 2 * DAY_MS);
  assert.equal(nextChangeAt(record("owner"), NOW), null);
  assert.equal(daysUntil(NOW + 1, NOW), 1);
  assert.equal(daysUntil(NOW - DAY_MS, NOW), 0);
  assert.equal(daysUntil(null, NOW), null);

  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.ok(
    rules.includes(`readOnlyAfter + ${READ_ONLY_GRACE_MS}`),
    "firestore.rules deve usar a mesma tolerância READ_ONLY_GRACE_MS"
  );
  assert.ok(/match \/account_plans\/\{userId\}[\s\S]*?allow write: if false;/.test(rules), "account_plans só pode ser escrito pelo servidor");
}

{
  let seed = 7;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)];

  const randomState = (): WorkspaceState => {
    const notebooks: UsageNotebook[] = [];
    const pages: UsagePage[] = [];
    const notebookCount = 1 + Math.floor(random() * 12);
    for (let index = 0; index < notebookCount; index += 1) {
      const parent = notebooks.length && random() < 0.65 ? pick(notebooks).id : null;
      notebooks.push({
        id: `n${index}`,
        parentId: parent,
        archived: random() < 0.1,
        deletedAt: random() < 0.08 ? NOW : null,
      });
    }
    const pageCount = Math.floor(random() * 30);
    for (let index = 0; index < pageCount; index += 1) {
      const parent = pages.length && random() < 0.4 ? pick(pages) : null;
      pages.push({
        id: `p${index}`,
        notebookId: parent ? parent.notebookId : random() < 0.9 ? pick(notebooks).id : null,
        parentPageId: parent?.id ?? null,
        path: parent ? [...(parent.path ?? []), parent.id] : [],
        archived: random() < 0.08,
        deletedAt: random() < 0.06 ? NOW : null,
      });
    }
    return { notebooks, pages };
  };

  const smallLimits = (): PlanLimits => ({
    pages: 1 + Math.floor(random() * 4),
    notebooksPerPage: 1 + Math.floor(random() * 4),
    notesPerNotebook: 1 + Math.floor(random() * 4),
    subnotesPerNote: Math.floor(random() * 3),
    activeGoals: 1 + Math.floor(random() * 3),
  });

  let compared = 0;
  for (let round = 0; round < 400; round += 1) {
    const state = randomState();
    const limits = round % 4 === 0 ? PLAN_LIMITS.basic : smallLimits();
    const index = indexUsage(state);
    const liveNotebooks = state.notebooks.filter((notebook) => index.liveNotebook(notebook.id));
    const livePages = state.pages.filter((page) => index.livePage(page.id));

    for (const parentId of [null, ...liveNotebooks.map((notebook) => notebook.id)]) {
      const fast = newNotebookViolation(index, limits, parentId);
      const slow = firstGrowthViolation(state, withNewNotebook(state, parentId), limits);
      assert.deepEqual(fast, slow, `caderno em ${parentId}: atalho e simulação divergem`);
      compared += 1;
    }
    const targets = [
      { notebookId: null, parentPageId: null },
      ...liveNotebooks.map((notebook) => ({ notebookId: notebook.id, parentPageId: null })),
      ...livePages.map((page) => ({ notebookId: page.notebookId, parentPageId: page.id })),
    ];
    for (const target of targets) {
      const fast = newPageViolation(index, limits, target);
      const slow = firstGrowthViolation(state, withNewPage(state, target), limits);
      assert.deepEqual(fast, slow, `nota em ${JSON.stringify(target)}: atalho e simulação divergem`);
      compared += 1;
    }
    assert.equal(usageIndexOf(state), usageIndexOf(state), "índice de uso deve ser reaproveitado");
    assert.deepEqual(summarizeUsage(measureUsage(state)), summarizeUsage(index));
  }
  assert.ok(compared > 2000);
}

{
  const notebooks: UsageNotebook[] = [
    { id: "root", parentId: null },
    { id: "extra-root", parentId: null },
    { id: "a", parentId: "root" },
    { id: "b", parentId: "root" },
    { id: "old", parentId: "root", archived: true },
  ];
  const pages: UsagePage[] = [
    { id: "n1", notebookId: "a", parentPageId: null, path: [] },
    { id: "n2", notebookId: "a", parentPageId: null, path: [] },
    { id: "s1", notebookId: "a", parentPageId: "n1", path: ["n1"] },
    { id: "s2", notebookId: "a", parentPageId: "s1", path: ["n1", "s1"] },
    { id: "gone", notebookId: "a", parentPageId: null, path: [], deletedAt: NOW },
    { id: "hidden", notebookId: "old", parentPageId: null, path: [] },
  ];
  const state: WorkspaceState = { notebooks, pages };
  const usage = measureUsage(state);
  assert.equal(usage.pages, 2);
  assert.equal(usage.notebooksByPage.get("root"), 2, "caderno arquivado não conta");
  assert.equal(usage.notesByNotebook.get("a"), 2, "nota na lixeira não conta");
  assert.equal(usage.subnotesByNote.get("n1"), 2, "subnotas contam pela nota do topo");

  const basic = PLAN_LIMITS.basic;
  assert.equal(firstGrowthViolation(state, withNewNotebook(state, null), basic)?.key, "pages");
  assert.equal(firstGrowthViolation(state, withNewPage(state, { notebookId: "a", parentPageId: "n2" }), basic)?.key, "subnotesPerNote");
  assert.equal(
    firstGrowthViolation(state, withMovedPage(state, "n2", { notebookId: "a", parentPageId: null }), basic),
    null,
    "acima do limite, reorganizar sem aumentar o total continua permitido"
  );
  assert.equal(
    firstGrowthViolation(state, withMovedPage(state, "s2", { notebookId: "a", parentPageId: null }), basic),
    null,
    "transformar subnota em nota não aumenta nenhum total acima do limite"
  );
  assert.equal(
    firstGrowthViolation(state, withMovedPage(state, "s1", { notebookId: "a", parentPageId: null }), basic)?.key,
    "subnotesPerNote",
    "promover subnota que tem subnotas cria uma nota acima do limite"
  );
  const fullNotebook: WorkspaceState = {
    notebooks: [{ id: "root", parentId: null }, { id: "a", parentId: "root" }, { id: "b", parentId: "root" }],
    pages: Array.from({ length: 15 }, (_, index) => ({ id: `f${index}`, notebookId: "a", parentPageId: null, path: [] })).concat([
      { id: "x", notebookId: "b", parentPageId: null, path: [] },
    ]),
  };
  assert.equal(
    firstGrowthViolation(fullNotebook, withMovedPage(fullNotebook, "x", { notebookId: "a", parentPageId: null }), basic)?.key,
    "notesPerNotebook"
  );
  assert.equal(firstGrowthViolation(state, withDuplicatedPage(state, "n1"), PLAN_LIMITS.pro), null);
  assert.equal(
    firstGrowthViolation(state, withDuplicatedPage(state, "n1"), { ...PLAN_LIMITS.pro, notesPerNotebook: 2 })?.key,
    "notesPerNotebook"
  );
  const duplicated = measureUsage(withDuplicatedNotebook(state, "a"));
  assert.equal(duplicated.notebooksByPage.get("root"), 3);
  assert.equal(firstGrowthViolation(state, state, { ...UNLIMITED }), null);

  const tracker = new GrowthTracker({ notebooks: [], pages: [] }, PLAN_LIMITS.basic);
  tracker.checkNotebook(null);
  tracker.addNotebook("t1", null);
  assert.throws(() => tracker.checkNotebook(null), (error: unknown) => isPlanError(error) && (error as PlanError).violation?.key === "pages");
  tracker.addNotebook("t2", "t1");
  for (let index = 0; index < 15; index += 1) {
    tracker.checkPage("t2", null);
    tracker.addPage(`tp${index}`, "t2", null);
  }
  assert.throws(() => tracker.checkPage("t2", null), (error: unknown) => (error as PlanError).violation?.key === "notesPerNotebook");
  assert.throws(() => tracker.checkPage("t2", "tp0"), (error: unknown) => (error as PlanError).violation?.key === "subnotesPerNote");

  assert.equal(goalGrowthViolation(1, 2, 1)?.key, "activeGoals");
  assert.equal(goalGrowthViolation(3, 2, 1), null, "arquivar objetivos acima do limite é permitido");
  assert.equal(goalGrowthViolation(5, 6, null), null);
  const restored = restoreGrowthViolation({
    limits: PLAN_LIMITS.basic,
    current: { notebooks: [], pages: [] },
    currentGoals: [{ id: "g1", archived: false }],
    notebooks: [],
    pages: [],
    goals: [{ id: "g2", archived: false }],
    clean: false,
  });
  assert.equal(restored?.key, "activeGoals");
  assert.equal(
    restoreGrowthViolation({
      limits: PLAN_LIMITS.basic,
      current: { notebooks: [], pages: [] },
      currentGoals: [{ id: "g1", archived: false }],
      notebooks: [{ id: "r1", parentId: null }],
      pages: [],
      goals: [{ id: "g1", archived: false }],
      clean: true,
    }),
    null,
    "restauração limpa substitui o conteúdo atual"
  );
}

{
  const now = NOW + DAY_MS;
  const basic = entitlementsOf("basic", {}, now);
  const pro = entitlementsOf("pro", {}, now);
  const readOnly = entitlementsOf("free", {}, NOW + TRIAL_MS);
  const ultraTrial = entitlementsOf("free", {}, now);
  const readOnlyDetail: PlanErrorDetail = { code: "read_only", violation: null, feature: null };

  assert.equal(writeCheck(basic), null);
  assert.deepEqual(writeCheck(readOnly), readOnlyDetail);
  assert.deepEqual(featureCheck(basic, "video"), { code: "feature", violation: null, feature: "video" });
  assert.equal(featureCheck(pro, "video"), null);
  assert.deepEqual(featureCheck(pro, "aiFlashcards"), { code: "feature", violation: null, feature: "aiFlashcards" });
  assert.equal(featureCheck(ultraTrial, "aiFlashcards"), null, "o teste libera tudo do Ultra");
  assert.deepEqual(featureCheck(readOnly, "transcription"), readOnlyDetail);
  assert.equal(featureCheck(readOnly, "archive"), null, "somente leitura ainda arquiva");

  const pages = [
    { id: "p1", notebookId: "a", parentPageId: null, path: [], blocks: [{ type: "paragraph", children: [{ type: "video" }] }] },
    { id: "p2", notebookId: "a", parentPageId: null, path: [], blocks: [{ type: "paragraph" }] },
    { id: "p3", notebookId: "a", parentPageId: "p2", path: ["p2"], blocks: [{ type: "file", media: { name: "aula.mov" } }] },
  ];
  const state = { notebooks: [{ id: "root", parentId: null }, { id: "a", parentId: "root" }], pages };
  assert.equal(duplicatePageCheck(basic, state, "p1")?.feature, "video", "duplicar nota com vídeo exige plano com vídeo");
  assert.equal(duplicatePageCheck(basic, state, "p2")?.feature, "video", "a subnota com vídeo também conta");
  assert.equal(duplicatePageCheck(pro, state, "p2"), null);
  assert.deepEqual(duplicatePageCheck(readOnly, state, "p2"), readOnlyDetail);
  assert.equal(duplicateNotebookCheck(basic, state, "a")?.feature, "video");
  assert.equal(duplicateNotebookCheck(pro, state, "a"), null);

  const appPages = [
    { id: "q1", notebookId: "a", parentPageId: null, path: [], archived: false },
    { id: "q2", notebookId: "a", parentPageId: "q1", path: ["q1"], archived: false },
  ] as unknown as Page[];
  const archive = planArchivePageTree(appPages, "q1");
  assert.ok(archive);
  assert.deepEqual(archivePlanCheck(basic, { notebooks: state.notebooks, pages: appPages }, archive), {
    code: "feature",
    violation: null,
    feature: "archive",
  });
  assert.equal(archivePlanCheck(pro, { notebooks: state.notebooks, pages: appPages }, archive), null);
  assert.equal(archivePlanCheck(readOnly, { notebooks: state.notebooks, pages: appPages }, archive), null);
  const archivedPages = appPages.map((page) => ({ ...page, archived: page.id === "q1" })) as Page[];
  const unarchive = planUnarchivePageTree(archivedPages, "q1");
  assert.ok(unarchive);
  assert.equal(archivePlanCheck(readOnly, { notebooks: state.notebooks, pages: archivedPages }, unarchive), null);
  const crowded = {
    notebooks: state.notebooks,
    pages: [
      ...archivedPages,
      ...Array.from({ length: 30 }, (_, index) => ({ id: `c${index}`, notebookId: null, parentPageId: null, path: [] })),
    ] as Page[],
  };
  assert.equal(archivePlanCheck(pro, crowded, unarchive)?.violation?.key, "notesPerNotebook", "desarquivar respeita o limite");

  const trashed = {
    notebooks: state.notebooks,
    pages: [
      ...Array.from({ length: 15 }, (_, index) => ({ id: `t${index}`, notebookId: "a", parentPageId: null, path: [] })),
      { id: "bin", notebookId: "a", parentPageId: null, path: [], deletedAt: NOW },
    ],
  };
  assert.equal(restorePageCheck(basic, trashed, "bin")?.violation?.key, "notesPerNotebook");
  assert.equal(restorePageCheck(readOnly, trashed, "bin"), null, "somente leitura ainda restaura da lixeira");

  const subnote = { notebookId: "a", parentPageId: "p2" };
  assert.deepEqual(noteTargetFor(subnote, basic), { notebookId: "a", parentPageId: null }, "sem subnotas, a nova nota vira irmã");
  assert.equal(noteTargetFor(subnote, pro), subnote);
  assert.equal(noteTargetFor({ notebookId: "a", parentPageId: null }, basic).parentPageId, null);
}

{
  const require = createRequire(import.meta.url);
  const { createPlanGuard } = require("../src/lib/plans/guard.ts") as typeof import("../src/lib/plans/guard");
  const { usePlanStore } = require("../src/lib/plans/client.ts") as typeof import("../src/lib/plans/client");
  const calls: string[] = [];
  const base = new Proxy(
    {},
    {
      get: (_target, property) =>
        typeof property === "string"
          ? (...args: unknown[]) => {
              calls.push(property);
              return Promise.resolve(args[1] ?? null);
            }
          : undefined,
    }
  ) as DataAdapter;
  const snapshot: GuardSnapshot = {
    notebooks: [
      { id: "root", parentId: null },
      { id: "a", parentId: "root" },
    ] as Notebook[],
    pages: [
      { id: "n1", notebookId: "a", parentPageId: null, path: [], blocks: [] },
      { id: "bin", notebookId: "a", parentPageId: null, path: [], blocks: [], deletedAt: NOW },
    ] as unknown as Page[],
    databases: [],
  };
  const adapter = createPlanGuard(base, () => snapshot);
  const switchPlan = (plan: PlanId, startedDaysAgo = 1) => {
    const now = Date.now();
    const next = newPlanRecord({ uid: "u1", email: "u@x.com", plan, now: now - startedDaysAgo * DAY_MS, source: "admin", updatedBy: null });
    usePlanStore.setState({ uid: "u1", guest: false, record: next, loaded: true, clockOffset: 0, tick: now });
  };
  const blocked = async (run: () => Promise<unknown>, expected: string) => {
    const before = calls.length;
    await assert.rejects(run, (error: unknown) => isPlanError(error) && (error as Error).message === expected, expected);
    assert.equal(calls.length, before, `${expected}: a operação chegou ao armazenamento`);
  };
  const allowed = async (run: () => Promise<unknown>, method: string) => {
    const before = calls.length;
    await run();
    assert.equal(calls.slice(before).join(), method, `${method} deveria passar`);
  };
  const video = { name: "aula.mp4", type: "video/mp4" } as File;
  const image = { name: "foto.png", type: "image/png" } as File;

  switchPlan("basic");
  await blocked(() => adapter.createNotebook({ name: "Outra", parentId: null }), "PLAN_LIMIT:pages:1");
  await allowed(() => adapter.createNotebook({ name: "Sub", parentId: "root" }), "createNotebook");
  await blocked(() => adapter.createPage({ notebookId: "a", parentPageId: "n1" }), "PLAN_LIMIT:subnotesPerNote:0");
  await allowed(() => adapter.createPage({ notebookId: "a" }), "createPage");
  await blocked(() => adapter.saveAttachment("n1", video), "PLAN_FEATURE:video");
  await blocked(() => adapter.uploadAttachment("n1", video), "PLAN_FEATURE:video");
  await allowed(() => adapter.saveAttachment("n1", image), "saveAttachment");
  await blocked(() => adapter.createFlashcard({} as Parameters<DataAdapter["createFlashcard"]>[0]), "PLAN_FEATURE:flashcards");
  await blocked(() => adapter.updatePage("n1", { archived: true }), "PLAN_FEATURE:archive");
  await allowed(() => adapter.updatePage("n1", { title: "Novo" }), "updatePage");
  assert.deepEqual(await adapter.duplicatePage("n1", { includeFlashcards: true }), { includeFlashcards: false });

  switchPlan("pro");
  await allowed(() => adapter.createPage({ notebookId: "a", parentPageId: "n1" }), "createPage");
  await allowed(() => adapter.saveAttachment("n1", video), "saveAttachment");
  await allowed(() => adapter.updatePage("n1", { archived: true }), "updatePage");
  const duplicated = await adapter.duplicatePage("n1", { includeFlashcards: true });
  assert.deepEqual(duplicated, { includeFlashcards: true });

  switchPlan("free", TRIAL_DAYS + 1);
  await blocked(() => adapter.createPage({ notebookId: "a" }), "PLAN_READ_ONLY");
  await blocked(() => adapter.createNotebook({ name: "X", parentId: "root" }), "PLAN_READ_ONLY");
  await blocked(() => adapter.updatePage("n1", { title: "Editar" }), "PLAN_READ_ONLY");
  await blocked(() => adapter.updatePage("n1", { archived: true, title: "Editar" }), "PLAN_READ_ONLY");
  await blocked(() => adapter.saveAttachment("n1", image), "PLAN_READ_ONLY");
  await blocked(() => adapter.createFlashcard({} as Parameters<DataAdapter["createFlashcard"]>[0]), "PLAN_READ_ONLY");
  await blocked(() => adapter.duplicatePage("n1"), "PLAN_READ_ONLY");
  await allowed(() => adapter.updatePage("n1", { archived: true, notebookId: "a", parentPageId: null }), "updatePage");
  await allowed(() => adapter.updateNotebook("a", { archived: true, parentId: "root" }), "updateNotebook");
  await allowed(() => adapter.restorePage("bin"), "restorePage");
  await allowed(() => adapter.trashPage("n1"), "trashPage");
  await allowed(() => adapter.purgePage("bin"), "purgePage");

  switchPlan("free");
  await allowed(() => adapter.createPage({ notebookId: "a", parentPageId: "n1" }), "createPage");
  await allowed(() => adapter.saveAttachment("n1", video), "saveAttachment");
}

{
  assert.equal(isVideoMedia({ name: "aula.mp4" }), true);
  assert.equal(isVideoMedia({ name: "AULA.MOV" }), true);
  assert.equal(isVideoMedia({ name: "voz.webm" }), false);
  assert.equal(isVideoMedia({ name: "voz.webm", type: "video/webm" }), true);
  assert.equal(isVideoMedia({ name: "clip.mp4", type: "audio/mp4" }), false);
  assert.equal(isVideoMedia({ name: "musica.mp3" }), false);
  assert.equal(isVideoMedia({ name: "nota.pdf", type: "application/pdf" }), false);

  assert.equal(isVideoBlock({ type: "video" }), true);
  assert.equal(isVideoBlock({ type: "file", media: { mimeType: "video/quicktime" } }), true);
  assert.equal(isVideoBlock({ type: "audio", media: { name: "a.m4a", mimeType: "audio/mp4" } }), false);
  assert.equal(isVideoBlock(null), false);

  const tree = [
    { id: "1", type: "paragraph" },
    { id: "2", type: "toggle", children: [{ id: "3", type: "video" }, { id: "4", type: "paragraph" }] },
    { id: "5", type: "file", media: { name: "x.mkv" } },
  ];
  assert.equal(blocksContainVideo(tree), true);
  const stripped = withoutVideoBlocks(tree as Array<{ id: string; type: string; children?: never[] }>);
  assert.equal(stripped.removed, 2);
  assert.deepEqual(
    stripped.blocks.map((block) => block.id),
    ["1", "2"]
  );
  assert.equal(blocksContainVideo(stripped.blocks), false);
  type TestBlock = { id: string; type: string; children?: TestBlock[] };
  const clean: TestBlock[] = [{ id: "a", type: "paragraph" }];
  assert.equal(withoutVideoBlocks(clean).blocks, clean, "sem vídeo, o array original é mantido");
  assert.equal(pageContainsVideo({ blocksJson: JSON.stringify(tree) }), true);
  assert.equal(pageContainsVideo({ blocksJson: "{inválido" }), false);
  assert.equal(pageContainsVideo({ blocks: clean }), false);
}

{
  const details: PlanErrorDetail[] = [
    { code: "read_only", violation: null, feature: null },
    { code: "unavailable", violation: null, feature: null },
    ...FEATURE_KEYS.map((feature) => ({ code: "feature" as const, violation: null, feature })),
    ...LIMIT_KEYS.map((key) => ({ code: "limit" as const, violation: { key, limit: 3, count: 3 }, feature: null })),
  ];
  for (const detail of details) {
    const message = planErrorMessage(detail);
    assert.deepEqual(parsePlanErrorMessage(message), detail, message);
    const error = toPlanError(new Error(message));
    assert.ok(error && isPlanError(error));
    assert.equal(error.code, detail.code);
  }
  for (const invalid of ["", "PLAN_FEATURE:teleport", "PLAN_LIMIT:pages:x", "PLAN_LIMIT:planets:3", "erro qualquer"]) {
    assert.equal(parsePlanErrorMessage(invalid), null, invalid);
  }
  assert.equal(toPlanError("PLAN_READ_ONLY"), null);
  assert.equal(PlanError.limit({ key: "pages", limit: 1, count: 2 }).message, "PLAN_LIMIT:pages:1");

  const reference = PLAN_DICTIONARIES.pt;
  const referenceKeys = Object.keys(reference).sort();
  const tokens = (text: string) =>
    Array.from(text.matchAll(/\{(\w+)(?:\|[^}]*)?\}/g), (match) => match[1])
      .filter((name, index, list) => list.indexOf(name) === index)
      .sort();
  for (const language of LOCALES) {
    const dictionary = PLAN_DICTIONARIES[language];
    assert.ok(dictionary, `planos sem dicionário em ${language}`);
    assert.deepEqual(Object.keys(dictionary).sort(), referenceKeys, `${language}: chaves diferentes do pt`);
    for (const key of referenceKeys) {
      const text = dictionary[key as keyof typeof reference];
      assert.ok(text.trim(), `${language}.${key} vazio`);
      assert.deepEqual(tokens(text), tokens(reference[key as keyof typeof reference]), `${language}.${key}: parâmetros diferentes do pt`);
    }
    for (const detail of details) {
      const text = planErrorText(detail, language, true);
      assert.ok(text && !/\{\w+\}/.test(text) && !text.startsWith("error_"), `${language}: mensagem ruim para ${planErrorMessage(detail)}`);
    }
    assert.ok(planErrorText({ code: "limit", violation: { key: "subnotesPerNote", limit: 0, count: 1 }, feature: null }, language, false));
  }
}

{
  assert.equal(LEGAL_FACTS.trialDays, TRIAL_DAYS);
  const placeholders = legalPlaceholders();
  for (const plan of PAID_PLANS) {
    for (const key of LIMIT_KEYS) {
      assert.equal(placeholders[planLimitPlaceholder(plan, key)], String(PLAN_LIMITS[plan][key]));
    }
  }

  const bundles = new Map<string, LegalBundle>();
  for (const language of LOCALES) bundles.set(language, (await LEGAL_LOADERS[language]()).default);
  const tableOf = (bundle: LegalBundle) => {
    const block = bundle.terms.sections.find((section) => section.id === "pricing")?.blocks.find(
      (entry) => typeof entry === "object" && "table" in entry
    );
    assert.ok(block && typeof block === "object" && "table" in block, "termos sem tabela de planos");
    return block.table;
  };

  const source = tableOf(bundles.get("pt")!);
  assert.equal(source.rows.length, LIMIT_KEYS.length + FEATURE_KEYS.length);
  LIMIT_KEYS.forEach((key, index) => {
    assert.deepEqual(
      source.rows[index].slice(1),
      PAID_PLANS.map((plan) => `{${planLimitPlaceholder(plan, key)}}`),
      `termos: linha de ${key} não usa os limites do código`
    );
  });
  FEATURE_KEYS.forEach((feature, offset) => {
    assert.deepEqual(
      source.rows[LIMIT_KEYS.length + offset].slice(1),
      PAID_PLANS.map((plan) => (PLAN_FEATURES[plan][feature] ? "Sim" : "Não")),
      `termos: linha de ${feature} diverge dos recursos do plano`
    );
  });

  for (const [language, bundle] of bundles) {
    const table = tableOf(bundle);
    const mapping = new Map<string, string>();
    const reverse = new Map<string, string>();
    source.rows.forEach((row, rowIndex) => {
      row.slice(1).forEach((cell, column) => {
        const translated = table.rows[rowIndex][column + 1];
        assert.equal(mapping.get(cell) ?? translated, translated, `${language}: "${cell}" traduzido de formas diferentes na tabela de planos`);
        assert.equal(reverse.get(translated) ?? cell, cell, `${language}: "${translated}" usado para valores diferentes na tabela de planos`);
        mapping.set(cell, translated);
        reverse.set(translated, cell);
      });
    });
  }
}

console.log("Planos de conta consistentes: limites, teste, somente leitura, vídeo, mensagens, traduções e termos.");
