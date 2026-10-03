import assert from "node:assert/strict";
import { linesFromText, mergeDrafts, parseSyllabus, subjectsFromCsv, topicListFromText, smartTitle } from "../src/lib/study/syllabus";
import { STUDY_DICTIONARIES } from "../src/lib/study/i18n/dictionaries";
import { SUPPORTED_LANGUAGES } from "../src/lib/i18n/languages";
import { formatTranslation } from "../src/lib/i18n/translations";
import {
  absorbExamQuestions,
  accuracyOf,
  aggregate,
  consistencyInfo,
  coverageOf,
  dayStatus,
  EXAM_OTHER_SUBJECT,
  examTotals,
  groupWithExams,
  resolveExamSubjectId,
  pagesPerHour,
  performanceBand,
  streakInfo,
  studiedDays,
} from "../src/lib/study/metrics";
import {
  advanceCycle,
  generateCycleItems,
  lapStates,
  pendingAgendaEntry,
  projectSchedule,
  recordAgendaDay,
  remapPointer,
  removeCompletion,
  roundProgress,
  subjectMinutes,
  undoLastCompletion,
} from "../src/lib/study/cycle";
import {
  dropAgendaDay,
  endAgendaBefore,
  makeAgendaEntry,
  nextOccurrence,
  nextWeekday,
  occursOn,
  upsertAgendaEntry,
  weeklyAgendaMinutes,
} from "../src/lib/study/agenda";
import { pagesFromRanges, safeUrl, secondsFromVideos, toSession, toSubject } from "../src/lib/study/normalize";
import { clockLabel, maskClock, parseClock, parseDurationInput } from "../src/lib/study/format";
import { addDays, dayRange, monthGrid, startOfWeek, weekdayOf } from "../src/lib/study/dates";
import { normalizeSettings } from "../src/lib/study/defaults";
import { cleanForStorage, studyBackendFor } from "../src/lib/study/backend";
import { buildNoteDirectory, materialNoteId, searchNotes } from "../src/lib/study/material";
import { bucketReviews, reviewForecast, reviewPunctuality, reviewStages } from "../src/lib/study/review-queue";
import type { StudyCycle, StudyReview, StudySession } from "../src/types/study";

const sample = [
  "CONHECIMENTOS GERAIS",
  "LÍNGUA PORTUGUESA: 1 Compreensão e interpretação de textos de gêneros variados. 2 Reconhecimento de tipos e gêneros textuais. 3 Domínio da ortografia oficial. 4 Domínio dos mecanismos de coesão textual. 4.1 Emprego de elementos de referenciação, substituição e repetição. 4.2 Emprego de tempos e modos verbais. 5 Emprego do sinal indicativo de crase.",
  "DIREITO CONSTITUCIONAL: 1 Constituição: conceito, classificações e princípios fundamentais. 2 Direitos e garantias fundamentais conforme a Lei nº 8.112/1990 e art. 5 da CF. 3 Organização do Estado. 4 Administração pública.",
  "RACIOCÍNIO LÓGICO",
  "1. Estruturas lógicas",
  "2. Lógica de argumentação",
  "3. Diagramas lógicos",
].join("\n");

const parsed = parseSyllabus(sample);
assert.equal(parsed.length, 3);
assert.equal(parsed[0].name, "Língua Portuguesa");
assert.equal(parsed[0].topics.length, 7);
assert.equal(parsed[0].topics[4], "4.1 Emprego de elementos de referenciação, substituição e repetição");
assert.equal(parsed[1].name, "Direito Constitucional");
assert.equal(parsed[1].topics.length, 4);
assert.ok(parsed[1].topics[1].includes("8.112/1990"));
assert.equal(parsed[2].name, "Raciocínio Lógico");
assert.deepEqual(parsed[2].topics, ["Estruturas lógicas", "Lógica de argumentação", "Diagramas lógicos"]);

assert.equal(smartTitle("NOÇÕES DE INFORMÁTICA E TI"), "Noções de Informática e TI");
assert.deepEqual(topicListFromText("Crase\nConcordância\nRegência"), ["Crase", "Concordância", "Regência"]);

const csv = subjectsFromCsv("Matéria;Tópico\nPortuguês;Crase\n;Regência\nDireito Penal;Crimes contra a vida\n");
assert.equal(csv.length, 2);
assert.deepEqual(csv[0].topics, ["Crase", "Regência"]);
assert.deepEqual(
  subjectsFromCsv("Disciplina;Tópico\nPortuguês;Crase\n").map((subject) => [subject.name, subject.topics]),
  [["Português", ["Crase"]]]
);

const runIn = parseSyllabus(
  "DIREITO ADMINISTRATIVO: 1 Atos administrativos. 2 Poderes da administração. LÍNGUA PORTUGUESA: 1 Compreensão de textos. 2 Crase. NOÇÕES DE INFORMÁTICA (TI): 1 Redes. 2 Segurança da informação conforme a Lei nº 12.965/2014."
);
assert.deepEqual(
  runIn.map((subject) => [subject.name, subject.topics.length]),
  [["Direito Administrativo", 2], ["Língua Portuguesa", 2], ["Noções de Informática (TI)", 2]]
);

assert.deepEqual(linesFromText("1. Licitações\n- Contratos\n\n• contratos\n2) Improbidade administrativa\na) Bens públicos"), [
  "Licitações",
  "Contratos",
  "Improbidade administrativa",
  "Bens públicos",
]);
const merged = mergeDrafts(
  [{ name: "Direito Administrativo", color: "#111111", topics: [{ name: "Atos administrativos" }] }],
  [
    { name: "direito administrativo", topics: [{ name: "Atos Administrativos" }, { name: "Licitações" }] },
    { name: "Língua Portuguesa", topics: [{ name: "Crase" }, { name: " " }] },
    { name: "", topics: [] },
  ]
);
assert.equal(merged.subjects, 1);
assert.equal(merged.topics, 2);
assert.deepEqual(merged.drafts.map((draft) => [draft.name, draft.topics.map((topic) => topic.name)]), [
  ["Direito Administrativo", ["Atos administrativos", "Licitações"]],
  ["Língua Portuguesa", ["Crase"]],
]);
assert.ok(merged.drafts[1].color && merged.drafts[1].color !== "#111111");

const reference = STUDY_DICTIONARIES.pt;
const simpleParams = (text: string) => new Set([...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]));
const pluralGroups = (text: string) =>
  [...text.matchAll(/\{([A-Za-z0-9_]+)\|([^{}]*)\}/g)].map((match) => ({ name: match[1], forms: match[2].split("|").length }));
const expectedForms: Record<string, number> = { ru: 3, ar: 3 };

for (const language of SUPPORTED_LANGUAGES) {
  const dictionary = STUDY_DICTIONARIES[language.code];
  assert.ok(dictionary, `study dictionary missing for ${language.code}`);
  assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(reference).sort(), `study keys differ in ${language.code}`);
  if (language.code !== "pt") {
    const identical = Object.entries(reference).filter(
      ([key, base]) => base.length > 12 && dictionary[key as keyof typeof reference] === base
    ).length;
    assert.ok(identical / Object.keys(reference).length < 0.06, `${language.code} has ${identical} strings identical to pt`);
  }
  for (const [key, base] of Object.entries(reference)) {
    const value = dictionary[key as keyof typeof reference];
    assert.ok(value.trim(), `${language.code}.${key} is empty`);
    const available = new Set([...simpleParams(base), ...pluralGroups(base).map((group) => group.name)]);
    assert.deepEqual(
      [...simpleParams(value)].sort(),
      [...simpleParams(base)].sort(),
      `${language.code}.${key} placeholders differ from pt`
    );
    for (const group of pluralGroups(value)) {
      assert.ok(available.has(group.name), `${language.code}.${key} uses unknown plural param ${group.name}`);
      if (language.code === "ja" || language.code === "zh") {
        assert.fail(`${language.code}.${key} should not use plural groups`);
      }
      const forms = expectedForms[language.code] ?? 2;
      assert.equal(group.forms, forms, `${language.code}.${key} plural group needs ${forms} forms`);
    }
  }
}

assert.equal(formatTranslation(STUDY_DICTIONARIES.ru.in_days, "ru", { count: 1 }), "через 1 день");
assert.equal(formatTranslation(STUDY_DICTIONARIES.ru.in_days, "ru", { count: 3 }), "через 3 дня");
assert.equal(formatTranslation(STUDY_DICTIONARIES.ru.in_days, "ru", { count: 11 }), "через 11 дней");
assert.equal(formatTranslation(STUDY_DICTIONARIES.pt.review_interval, "pt", { count: 7 }), "+7 dias");
assert.equal(formatTranslation(STUDY_DICTIONARIES.ja.in_days, "ja", { count: 5 }), "5日後");

const session = (overrides: Partial<StudySession>): StudySession =>
  toSession({ id: overrides.id ?? "s", planId: "p", subjectId: "a", day: "2026-09-21", durationSec: 3600, ...overrides });

assert.equal(accuracyOf(0, 0), null);
assert.equal(accuracyOf(3, 1), 0.75);
const totals = aggregate([
  session({ id: "1", correct: 8, wrong: 2, pages: 20, durationSec: 3600 }),
  session({ id: "2", correct: 2, wrong: 8, durationSec: 1800 }),
]);
assert.equal(totals.seconds, 5400);
assert.equal(totals.questions, 20);
assert.equal(totals.accuracy, 0.5);
assert.equal(pagesPerHour(totals), 20);
assert.equal(performanceBand(0.69, { performanceLow: 70, performanceHigh: 85 }), "low");
assert.equal(performanceBand(0.85, { performanceLow: 70, performanceHigh: 85 }), "high");
assert.equal(performanceBand(null, { performanceLow: 70, performanceHigh: 85 }), null);

const weekdaysOnly = [1, 2, 3, 4, 5];
const friday = "2026-09-25";
assert.equal(weekdayOf(friday), 5);
const monday = "2026-09-28";
const streakDays = new Set(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", friday]);
const streak = streakInfo(streakDays, monday, weekdaysOnly);
assert.equal(streak.current, 5);
assert.equal(streak.studiedToday, false);
const brokenStreak = streakInfo(new Set(["2026-09-21", "2026-09-23"]), "2026-09-24", weekdaysOnly);
assert.equal(brokenStreak.current, 1);
assert.equal(brokenStreak.best, 1);
const consistency = consistencyInfo(streakDays, monday, weekdaysOnly);
assert.equal(consistency.planned, 5);
assert.equal(consistency.studied, 5);
assert.equal(consistency.ratio, 1);
assert.equal(studiedDays([session({ id: "z", durationSec: 0, correct: 0, wrong: 0 })]).size, 0);
assert.equal(studiedDays([session({ id: "short", durationSec: 14 * 60, correct: 20, wrong: 0 })]).size, 0);
assert.equal(studiedDays([session({ id: "min", durationSec: 15 * 60, correct: 0, wrong: 0 })]).size, 1);
assert.equal(
  studiedDays([
    session({ id: "a", day: "2026-09-21", durationSec: 8 * 60 }),
    session({ id: "b", day: "2026-09-21", durationSec: 7 * 60 }),
  ]).size,
  1
);

const tf = examTotals({
  style: "truefalse",
  rows: [
    { id: "r1", subjectId: null, name: "A", weight: 1, total: 50, correct: 30, wrong: 10, blank: 10 },
    { id: "r2", subjectId: null, name: "B", weight: 2, total: 20, correct: 10, wrong: 5, blank: 5 },
  ],
});
assert.equal(tf.score, 30);
assert.equal(tf.maxScore, 90);
assert.equal(tf.blank, 15);
const mc = examTotals({ style: "multiple", rows: [{ id: "r", subjectId: null, name: "A", weight: 1, total: 10, correct: 7, wrong: 3, blank: 0 }] });
assert.equal(mc.percent, 0.7);
const examSubjects = [
  { id: "ing", name: "Inglês" },
  { id: "dir", name: "Direito" },
];
const mixedExam = {
  id: "e1",
  planId: "p",
  day: "2026-10-02" as const,
  name: "Simulado",
  style: "multiple" as const,
  board: "",
  durationSec: 3600,
  comment: "",
  createdAt: 0,
  updatedAt: 0,
  rows: [
    { id: "a", subjectId: "ing", name: "Inglês", weight: 1, total: 50, correct: 40, wrong: 10, blank: 0 },
    { id: "b", subjectId: null, name: "direito", weight: 1, total: 20, correct: 10, wrong: 5, blank: 5 },
    { id: "c", subjectId: null, name: "testando", weight: 1, total: 150, correct: 100, wrong: 50, blank: 0 },
    { id: "d", subjectId: null, name: "vazia", weight: 1, total: 10, correct: 0, wrong: 0, blank: 10 },
  ],
};
assert.equal(resolveExamSubjectId(mixedExam.rows[0], examSubjects), "ing");
assert.equal(resolveExamSubjectId(mixedExam.rows[1], examSubjects), "dir");
assert.equal(resolveExamSubjectId(mixedExam.rows[2], examSubjects), EXAM_OTHER_SUBJECT);
const grouped = groupWithExams([], [mixedExam], examSubjects);
assert.equal(grouped.get("ing")?.questions, 50);
assert.equal(grouped.get("ing")?.correct, 40);
assert.equal(grouped.get("dir")?.questions, 15);
assert.equal(grouped.get(EXAM_OTHER_SUBJECT)?.questions, 150);
assert.equal(grouped.get(EXAM_OTHER_SUBJECT)?.wrong, 50);
const absorbed = absorbExamQuestions(aggregate([]), [mixedExam], examSubjects);
assert.equal(absorbed.questions, 215);
assert.equal(absorbed.correct, 150);
assert.equal(absorbed.accuracy, 150 / 215);

const subject = toSubject({
  id: "a",
  planId: "p",
  name: "A",
  color: "not-a-color",
  topics: [
    { id: "t1", name: "Um", done: true, url: "javascript:alert(1)" },
    { id: "t2", name: "Dois", done: false, url: " https://example.com/aula " },
  ],
});
assert.equal(subject.topics[0].url, null);
assert.equal(subject.topics[1].url, "https://example.com/aula");
assert.match(subject.color, /^#[0-9a-f]{6}$/i);
assert.deepEqual(coverageOf([subject]), { done: 1, total: 2, ratio: 0.5 });
assert.equal(safeUrl("ftp://example.com"), null);
assert.equal(safeUrl("https://exa mple.com"), null);
assert.equal(safeUrl(`https://example.com/${"a".repeat(2100)}`), null);

const noteSources = {
  subjects: [
    toSubject({ id: "m", planId: "p", name: "M", topics: [{ id: "mt1", name: "T1", pageId: "topic-note" }, { id: "mt2", name: "T2" }] }),
  ],
  sessions: [
    session({ id: "n1", subjectId: "m", topicId: "mt2", day: "2026-09-01", pageId: "old-note" }),
    session({ id: "n2", subjectId: "m", topicId: "mt2", day: "2026-09-10", pageId: "new-note" }),
    session({ id: "n3", subjectId: "m", topicId: "mt1", day: "2026-09-11", pageId: "session-note" }),
    session({ id: "n4", subjectId: "m", topicId: "mt2", day: "2026-09-12", pageId: "deleted-note" }),
  ],
  reviews: [
    {
      id: "rv",
      planId: "p",
      subjectId: "m",
      topicId: "mt1",
      sessionId: "n3",
      intervalDays: 7,
      dueDay: "2026-09-18",
      status: "pending" as const,
      resolvedAt: null,
      resolvedSessionId: null,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
};
const alive = (pageId: string) => pageId !== "deleted-note";
assert.equal(materialNoteId({ reviewId: "rv" }, noteSources, alive), "session-note");
assert.equal(materialNoteId({ subjectId: "m", topicId: "mt1" }, noteSources, alive), "topic-note");
assert.equal(materialNoteId({ subjectId: "m", topicId: "mt2" }, noteSources, alive), "new-note");
assert.equal(materialNoteId({ subjectId: "m" }, noteSources, alive), null);
assert.equal(materialNoteId({ subjectId: "m", topicId: "mt1" }, noteSources, () => false), null);

const directory = buildNoteDirectory(
  [
    { id: "p1", title: "Crase", notebookId: "nb-pt", parentPageId: null, updatedAt: 1 },
    { id: "p2", title: "Crase", notebookId: "nb-es", parentPageId: null, updatedAt: 5 },
    { id: "p3", title: "Exercícios", notebookId: "nb-pt", parentPageId: "p1", updatedAt: 3 },
    { id: "p4", title: "", notebookId: null, parentPageId: null, updatedAt: 2 },
  ],
  [
    { id: "root", name: "Concurso TCU" },
    { id: "nb-pt", name: "Português", parentId: "root" },
    { id: "nb-es", name: "Espanhol", parentId: "root" },
  ],
  "Sem título"
);
assert.deepEqual(directory.find((entry) => entry.id === "p3")?.trail, ["Concurso TCU", "Português", "Crase"]);
assert.equal(directory.find((entry) => entry.id === "p4")?.title, "Sem título");
assert.deepEqual(searchNotes(directory, "crase portugues").map((entry) => entry.id), ["p1", "p3"]);
assert.deepEqual(searchNotes(directory, "crase espanhol").map((entry) => entry.id), ["p2"]);
assert.equal(searchNotes(directory, "exerc")[0].id, "p3");
assert.equal(searchNotes(directory, "").length, 4);
assert.equal(searchNotes(directory, "inexistente").length, 0);

const stored = cleanForStorage({
  id: "doc",
  skip: undefined,
  broken: Number.NaN,
  topics: [{ id: "t-keep", name: "A", note: undefined }],
  items: [{ id: "i-keep", subjectId: "a", minutes: 30 }],
  nested: { id: "n-keep" },
});
assert.equal("id" in stored, false);
assert.equal("skip" in stored, false);
assert.equal(stored.broken, 0);
assert.equal(stored.topics[0].id, "t-keep");
assert.equal("note" in stored.topics[0], false);
assert.equal(stored.items[0].id, "i-keep");
assert.equal(stored.nested.id, "n-keep");

assert.equal(pagesFromRanges([{ from: 10, to: 19 }, { from: 30, to: 30 }, { from: 50, to: 40 }]), 11);
assert.equal(secondsFromVideos([{ title: "", fromSec: 60, toSec: 600 }, { title: "", fromSec: 500, toSec: 100 }]), 540);
const clamped = toSession({ id: "x", planId: "p", subjectId: "a", day: "bad", durationSec: -20, correct: 2.4, startMinute: 5000 });
assert.equal(clamped.day, "1970-01-01");
assert.equal(clamped.durationSec, 0);
assert.equal(clamped.correct, 2);
assert.equal(clamped.startMinute, 1439);

assert.equal(parseClock("01:30:15"), 5415);
assert.equal(parseClock("1:05"), 3900);
assert.equal(parseClock("45"), 2700);
assert.equal(parseClock("00:61:00"), null);
assert.equal(parseClock("abc"), null);
assert.equal(clockLabel(5415), "01:30:15");
assert.equal(clockLabel(75), "01:15");

// Campo de tempo com máscara: digitar só números monta HH:MM:SS da esquerda para a direita.
const typed = (keys: string) => [...keys].reduce((value, key) => maskClock(value + key), "");
assert.equal(typed("002000"), "00:20:00");
assert.equal(typed("0"), "0");
assert.equal(typed("00"), "00");
assert.equal(typed("002"), "00:2");
assert.equal(typed("0130"), "01:30");
assert.equal(typed("1:30"), "01:30");
assert.equal(typed("1:"), "01:");
assert.equal(typed("01:3:"), "01:03:");
assert.equal(typed("0020001"), "00:20:00");
assert.equal(maskClock("002000"), "00:20:00");
assert.equal(maskClock("1:30:00"), "01:30:00");
assert.equal(maskClock("00:20:", true), "00:20");
assert.equal(maskClock("ab12c3"), "12:3");
assert.equal(maskClock(":"), "");
assert.equal(parseDurationInput("00:20:00"), 1200);
assert.equal(parseDurationInput("45"), 2700);
assert.equal(parseDurationInput("01:30"), 5400);
assert.equal(parseDurationInput("01:"), 3600);
assert.equal(parseDurationInput("00:2"), 120);
assert.equal(parseDurationInput("00:75:00"), 4500);
assert.equal(parseDurationInput(""), 0);
assert.equal(parseDurationInput("1:2:3:4"), null);
assert.equal(parseDurationInput("1h"), null);
assert.equal(clockLabel(parseDurationInput("00:75:00") ?? 0, true), "01:15:00");

assert.equal(startOfWeek("2026-09-27", 1), "2026-09-21");
assert.equal(startOfWeek("2026-09-27", 0), "2026-09-27");
assert.equal(dayRange("2026-02-27", "2026-03-02").length, 4);
assert.equal(monthGrid("2026-09-15", 1)[0], "2026-08-31");
assert.equal(addDays("2026-12-31", 1), "2027-01-01");

const settings = normalizeSettings({ performanceLow: 90, performanceHigh: 60, reviewIntervals: [30, 1, 1, 7] } as never);
assert.ok(settings.performanceLow < settings.performanceHigh);
assert.deepEqual(settings.reviewIntervals, [1, 7, 30]);

const weekMinutes = [0, 120, 120, 120, 120, 120, 60];
const input = {
  subjects: [
    { subjectId: "a", weight: 5, level: 1 },
    { subjectId: "b", weight: 3, level: 3 },
    { subjectId: "c", weight: 1, level: 5 },
  ],
  weekMinutes,
  minBlock: 30,
  maxBlock: 60,
};
const minutes = subjectMinutes(input);
assert.ok((minutes.get("a") ?? 0) > (minutes.get("b") ?? 0));
assert.ok((minutes.get("b") ?? 0) > (minutes.get("c") ?? 0));
const items = generateCycleItems(input, (index) => `i${index}`);
assert.ok(items.length > 3);
assert.ok(items.every((item) => item.minutes >= 5 && item.minutes <= 60));
const cycleTotal = items.reduce((sum, item) => sum + item.minutes, 0);
assert.ok(Math.abs(cycleTotal - 660) <= 60, `cycle total ${cycleTotal} too far from weekly capacity`);
const adjacentRepeats = (list: { subjectId: string }[]) =>
  list.slice(1).filter((item, index) => item.subjectId === list[index].subjectId).length;
const minimumRepeats = (list: { subjectId: string }[]) => {
  const counts = new Map<string, number>();
  for (const item of list) counts.set(item.subjectId, (counts.get(item.subjectId) ?? 0) + 1);
  const largest = Math.max(...counts.values());
  return Math.max(0, largest - (list.length - largest) - 1);
};
assert.equal(adjacentRepeats(items), minimumRepeats(items));
const balanced = generateCycleItems(
  { ...input, subjects: input.subjects.map((config) => ({ ...config, weight: 3, level: 3 })) },
  (index) => `b${index}`
);
assert.equal(adjacentRepeats(balanced), 0);
const circularRepeats = (list: { subjectId: string }[]) =>
  list.filter((item, index) => item.subjectId === list[(index + 1) % list.length].subjectId).length;
assert.equal(circularRepeats(balanced), 0);
const dominant = generateCycleItems(
  {
    subjects: [
      { subjectId: "pt", weight: 5, level: 2 },
      { subjectId: "dc", weight: 4, level: 3 },
      { subjectId: "da", weight: 4, level: 3 },
      { subjectId: "ctb", weight: 3, level: 2 },
      { subjectId: "rl", weight: 2, level: 4 },
    ],
    weekMinutes: [0, 150, 150, 120, 150, 120, 180],
    minBlock: 40,
    maxBlock: 90,
    reservedMinutes: 45,
  },
  (index) => `d${index}`
);
const dominantLargest = Math.max(...[...new Set(dominant.map((item) => item.subjectId))].map((id) => dominant.filter((item) => item.subjectId === id).length));
assert.equal(circularRepeats(dominant), Math.max(0, dominantLargest - (dominant.length - dominantLargest)), "cycle must not repeat a subject across the lap boundary");

const cycle: StudyCycle = {
  id: "p",
  planId: "p",
  items,
  agenda: [],
  weekMinutes,
  pointer: 0,
  round: 0,
  history: [],
  subjects: input.subjects,
  minBlock: 30,
  maxBlock: 60,
  createdAt: 0,
  updatedAt: 0,
};
const sunday = "2026-09-27";
const projection = projectSchedule(cycle, sunday, addDays(sunday, 6), sunday);
assert.equal(projection.get(sunday), undefined);
const mondayBlocks = projection.get(monday) ?? [];
assert.ok(mondayBlocks.length > 0);
assert.equal(mondayBlocks[0].isNext, true);
assert.equal(mondayBlocks[0].itemId, items[0].id);
const plannedMinutes = [...projection.values()].flat().reduce((sum, block) => sum + block.minutes, 0);
assert.ok(plannedMinutes > 400);

const advanced = advanceCycle(cycle, monday, { at: 1, sessionId: "s1" });
assert.ok(advanced);
assert.equal(advanced.pointer, 1);
assert.equal(advanced.history.length, 1);
const afterAdvance = { ...cycle, ...advanced };
assert.equal(roundProgress(afterAdvance).done, 1);
const undone = undoLastCompletion(afterAdvance);
assert.ok(undone);
assert.equal(undone.pointer, 0);
assert.equal(undone.history.length, 0);
const lastItem = advanceCycle({ ...cycle, pointer: items.length - 1 }, monday, { at: 2, skipped: true });
assert.ok(lastItem);
assert.equal(lastItem.pointer, 0);
assert.equal(lastItem.round, 1);
assert.equal(lastItem.history[0].skipped, true);
const withHistory = projectSchedule({ ...cycle, ...advanced }, monday, monday, monday);
assert.equal((withHistory.get(monday) ?? [])[0].status, "done");

const mark = (index: number, round: number, skipped: boolean) => ({
  itemId: items[index].id,
  subjectId: items[index].subjectId,
  minutes: items[index].minutes,
  round,
  day: monday,
  sessionId: null,
  skipped,
  at: index,
});
const midLap = { ...cycle, pointer: 3, round: 1, history: [mark(4, 0, false), mark(0, 1, false), mark(1, 1, true)] };
assert.deepEqual(lapStates(midLap).slice(0, 5), ["done", "skipped", "skipped", "current", "pending"]);
const midProgress = roundProgress(midLap);
assert.equal(midProgress.done, 1);
assert.equal(midProgress.position, 4);
assert.equal(midProgress.minutesLeft, items.slice(3).reduce((sum, item) => sum + item.minutes, 0));
assert.equal(roundProgress({ ...midLap, pointer: 0, round: 2 }).done, 0);

const ids = (...values: string[]) => values.map((id) => ({ id }));
const abcd = { items: ids("a", "b", "c", "d").map((item) => ({ ...item, subjectId: "s", minutes: 30 })), pointer: 2, round: 4 };
assert.deepEqual(remapPointer(abcd, ids("c", "a", "b", "d")), { pointer: 0, round: 4 });
assert.deepEqual(remapPointer(abcd, ids("a", "b", "d")), { pointer: 2, round: 4 });
assert.deepEqual(remapPointer({ ...abcd, pointer: 3 }, ids("a", "b", "c")), { pointer: 0, round: 5 });
assert.deepEqual(remapPointer(abcd, ids("x", "y")), { pointer: 0, round: 4 });
assert.deepEqual(remapPointer(abcd, []), { pointer: 0, round: 4 });

// Registros apagados um a um, inclusive com o ciclo vazio.
const twoMarks = { ...cycle, pointer: 2, round: 0, history: [mark(0, 0, false), mark(1, 0, true)] };
const withoutOld = removeCompletion(twoMarks, twoMarks.history[0]);
assert.ok(withoutOld);
assert.equal(withoutOld.pointer, 2);
assert.deepEqual(withoutOld.history.map((entry) => entry.itemId), [items[1].id]);
const withoutLast = removeCompletion(twoMarks, twoMarks.history[1]);
assert.ok(withoutLast);
assert.equal(withoutLast.pointer, 1);
assert.equal(removeCompletion(twoMarks, { itemId: "nope", day: monday, at: 0 }), null);
const emptied = { ...twoMarks, items: [], pointer: 0 };
assert.equal(undoLastCompletion(emptied)?.history.length, 1);
assert.equal(removeCompletion(emptied, emptied.history[0])?.history.length, 1);

// Disciplinas em dias fixos.
const tuesday = "2026-09-29";
const wednesday = "2026-09-30";
const english = makeAgendaEntry(
  { subjectId: "en", minutes: 80, start: wednesday, repeat: "weekly", weekdays: [], topicId: null },
  { id: "en-weekly", until: null, removed: [], createdAt: 1 }
);
assert.equal(occursOn(english, wednesday), true);
assert.equal(occursOn(english, addDays(wednesday, 7)), true);
assert.equal(occursOn(english, addDays(wednesday, 1)), false);
assert.equal(occursOn(english, addDays(wednesday, -7)), false);
assert.equal(nextOccurrence(english, tuesday), wednesday);
assert.equal(nextWeekday(tuesday, 3), wednesday);
assert.equal(nextWeekday(tuesday, 2), tuesday);
const custom = makeAgendaEntry({ subjectId: "rl", minutes: 30, start: monday, repeat: "custom", weekdays: [5, 1, 1], topicId: null });
assert.deepEqual(custom.weekdays, [1, 5]);
assert.equal(occursOn(custom, friday), false);
assert.equal(occursOn(custom, "2026-10-02"), true);
assert.equal(makeAgendaEntry({ subjectId: "x", minutes: 30, start: monday, repeat: "custom", weekdays: [], topicId: null }).repeat, "none");
const monthly = makeAgendaEntry({ subjectId: "x", minutes: 30, start: "2026-09-30", repeat: "monthly", weekdays: [], topicId: null });
assert.equal(occursOn(monthly, "2026-10-30"), true);
assert.equal(occursOn(monthly, "2026-10-29"), false);

const skipped = dropAgendaDay([english], english.id, addDays(wednesday, 7));
assert.equal(occursOn(skipped[0], addDays(wednesday, 7)), false);
assert.equal(occursOn(skipped[0], addDays(wednesday, 14)), true);
assert.deepEqual(dropAgendaDay([{ ...english, repeat: "none" }], english.id, wednesday), []);
const ended = endAgendaBefore([english], english.id, addDays(wednesday, 14));
assert.equal(ended[0].until, addDays(wednesday, 13));
assert.equal(occursOn(ended[0], addDays(wednesday, 7)), true);
assert.equal(occursOn(ended[0], addDays(wednesday, 14)), false);
assert.equal(nextOccurrence(ended[0], addDays(wednesday, 8)), null);
assert.deepEqual(endAgendaBefore([english], english.id, wednesday), []);
assert.deepEqual(upsertAgendaEntry([english], { ...english, minutes: 60 }).map((entry) => entry.minutes), [60]);
assert.equal(upsertAgendaEntry([english], { ...english, id: "" }).length, 2);

const fixedCycle: StudyCycle = { ...cycle, pointer: 0, round: 0, history: [], agenda: [english] };
const fixedWeek = projectSchedule(fixedCycle, monday, addDays(monday, 6), tuesday);
const wednesdayBlocks = fixedWeek.get(wednesday) ?? [];
assert.equal(wednesdayBlocks[0].fixed, true);
assert.equal(wednesdayBlocks[0].status, "planned");
const rotationMinutes = (day: string) =>
  (fixedWeek.get(day) ?? []).filter((block) => !block.fixed).reduce((sum, block) => sum + block.minutes, 0);
assert.ok(rotationMinutes(wednesday) < rotationMinutes(addDays(wednesday, 1)), "fixed minutes must shrink the rotation that day");
const pastWeek = projectSchedule(fixedCycle, monday, addDays(monday, 6), "2026-10-02");
assert.equal((pastWeek.get(wednesday) ?? [])[0].status, "missed");

assert.equal(pendingAgendaEntry(fixedCycle, "en", wednesday)?.id, english.id);
assert.equal(pendingAgendaEntry(fixedCycle, "en", tuesday), null);
const marked = recordAgendaDay(fixedCycle, english, wednesday, { at: 5, sessionId: "s9" });
assert.ok(marked);
assert.equal(recordAgendaDay({ ...fixedCycle, ...marked }, english, wednesday, { at: 6 }), null);
assert.equal(recordAgendaDay(fixedCycle, english, tuesday, { at: 7 }), null);
const afterMark = { ...fixedCycle, ...marked };
assert.equal(pendingAgendaEntry(afterMark, "en", wednesday), null);
const markedWeek = projectSchedule(afterMark, monday, addDays(monday, 6), wednesday);
const wednesdayAfter = markedWeek.get(wednesday) ?? [];
assert.equal(wednesdayAfter.filter((block) => block.itemId === english.id).length, 1);
assert.equal(wednesdayAfter.find((block) => block.itemId === english.id)?.status, "done");
assert.equal(lapStates(afterMark)[0], "current");
assert.equal(undoLastCompletion(afterMark)?.pointer, afterMark.pointer);

// Tópico livre, tempo dos dias fixos e o desconto na geração automática.
const withNote = makeAgendaEntry({ subjectId: "en", minutes: 30, start: monday, repeat: "none", weekdays: [], topicId: null, note: "  Simulado   oral " });
assert.equal(withNote.note, "Simulado oral");
assert.equal(makeAgendaEntry({ subjectId: "en", minutes: 30, start: monday, repeat: "none", weekdays: [], topicId: "t1", note: "x" }).note, "");
assert.equal(weeklyAgendaMinutes([english], monday), 80);
assert.equal(weeklyAgendaMinutes([english, withNote], monday), 80);
assert.equal(weeklyAgendaMinutes([english, makeAgendaEntry({ subjectId: "x", minutes: 30, start: monday, repeat: "daily", weekdays: [], topicId: null })], monday), 80 + 7 * 30);
const reservedShares = subjectMinutes({ ...input, reservedMinutes: 330 });
const reservedTotal = [...reservedShares.values()].reduce((sum, value) => sum + value, 0);
const fullTotal = [...minutes.values()].reduce((sum, value) => sum + value, 0);
assert.ok(reservedTotal < fullTotal && Math.abs(reservedTotal - 330) <= 40, `reserved split ${reservedTotal}`);
assert.equal(subjectMinutes({ ...input, reservedMinutes: 10_000 }).size, 0);

const local = studyBackendFor("local", "verify");
let latestSubjects: Array<Record<string, unknown>> = [];
local.subscribe("study_subjects", (docs) => {
  latestSubjects = docs;
});
await local.commit([{ kind: "set", collection: "study_subjects", id: "tx", data: { name: "Tx", topics: [{ id: "a", name: "A" }] } }]);
await Promise.all(
  ["b", "c", "d"].map((topicId) =>
    local.commit([
      {
        kind: "transform",
        collection: "study_subjects",
        id: "tx",
        apply: (raw) => ({
          merge: { topics: [...((raw?.topics as Array<{ id: string; name: string }>) ?? []), { id: topicId, name: topicId.toUpperCase() }] },
          also: [{ kind: "set", collection: "study_sessions", id: `s-${topicId}`, data: { subjectId: "tx", topicId } }],
        }),
      },
    ])
  )
);
await new Promise((resolve) => setTimeout(resolve, 0));
const txSubject = latestSubjects.find((entry) => entry.id === "tx") as { topics: Array<{ id: string }> } | undefined;
assert.deepEqual(txSubject?.topics.map((topic) => topic.id), ["a", "b", "c", "d"]);
await local.commit([{ kind: "transform", collection: "study_subjects", id: "missing", apply: (raw) => (raw ? { merge: { name: "x" } } : {}) }]);
assert.equal(latestSubjects.some((entry) => entry.id === "missing"), false);

console.log("verify-study: ok");

{
  const studied = new Set(["2026-09-21", "2026-09-23"]);
  const weekdays = [1, 2, 3, 4, 5];
  const today = "2026-09-29";
  assert.equal(dayStatus("2026-09-20", studied, "2026-09-21", today, weekdays), "before");
  assert.equal(dayStatus("2026-09-21", studied, "2026-09-21", today, weekdays), "studied");
  assert.equal(dayStatus("2026-09-22", studied, "2026-09-21", today, weekdays), "missed");
  assert.equal(dayStatus("2026-09-27", studied, "2026-09-21", today, weekdays), "rest");
  assert.equal(dayStatus("2026-09-29", studied, "2026-09-21", today, weekdays), "pending");
  assert.equal(dayStatus("2026-09-30", studied, "2026-09-21", today, weekdays), "future");
  assert.equal(dayStatus("2026-09-27", studied, "2026-09-21", today, []), "missed");
  assert.equal(dayStatus("2026-09-22", studied, null, today, weekdays), "before");
}

console.log("verify-study: day status ok");

{
  const today = "2026-09-30";
  const noon = (day: string) => Date.parse(`${day}T12:00:00Z`);
  const review = (overrides: Partial<StudyReview>): StudyReview => ({
    id: "r",
    planId: "p",
    subjectId: "a",
    topicId: null,
    sessionId: "s1",
    intervalDays: 1,
    dueDay: today,
    status: "pending",
    resolvedAt: null,
    resolvedSessionId: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
  const reviews = [
    review({ id: "due", dueDay: today }),
    review({ id: "late", dueDay: "2026-09-27", intervalDays: 7 }),
    review({ id: "soon", dueDay: "2026-10-01", subjectId: "b" }),
    review({ id: "far", dueDay: "2026-11-15", intervalDays: 30 }),
    review({ id: "done-on-time", status: "done", dueDay: "2026-09-29", resolvedAt: noon("2026-09-29") }),
    review({ id: "done-late", status: "done", dueDay: "2026-09-20", resolvedAt: noon("2026-09-23") }),
    review({ id: "ignored-old", status: "ignored", dueDay: "2026-07-30", resolvedAt: noon("2026-08-01") }),
  ];
  const ids = (list: StudyReview[]) => list.map((entry) => entry.id);

  const all = bucketReviews(reviews, { today, timeZone: "UTC", period: "all" });
  assert.deepEqual(ids(all.due), ["due"]);
  assert.deepEqual(ids(all.overdue), ["late"]);
  assert.deepEqual(ids(all.upcoming), ["soon", "far"]);
  assert.deepEqual(ids(all.done), ["done-on-time", "done-late"]);
  assert.deepEqual(ids(all.ignored), ["ignored-old"]);
  // Trinta dias cortam o que vence depois e o que foi resolvido antes; "para hoje" nunca é cortada.
  const month = bucketReviews(reviews, { today, timeZone: "UTC", period: "30" });
  assert.deepEqual(ids(month.upcoming), ["soon"]);
  assert.deepEqual(ids(month.ignored), []);
  assert.deepEqual(ids(month.due), ["due"]);
  assert.deepEqual(ids(bucketReviews(reviews, { today, timeZone: "UTC", period: "all", subjectId: "b" }).upcoming), ["soon"]);

  // A etapa segue a ordem dos intervalos entre as irmãs da mesma sessão, disciplina e tópico.
  const stages = reviewStages([
    review({ id: "s30", intervalDays: 30, dueDay: "2026-10-29" }),
    review({ id: "s1", intervalDays: 1, status: "done", resolvedAt: noon("2026-10-01") }),
    review({ id: "s7", intervalDays: 7, dueDay: "2026-10-06" }),
    review({ id: "other", subjectId: "b", intervalDays: 7 }),
    review({ id: "loose", sessionId: "", intervalDays: 3 }),
  ]);
  assert.deepEqual([stages.get("s1")?.index, stages.get("s7")?.index, stages.get("s30")?.index], [1, 2, 3]);
  assert.equal(stages.get("s7")?.total, 3);
  assert.deepEqual(stages.get("s7")?.steps.map((step) => step.status), ["done", "pending", "pending"]);
  assert.deepEqual([stages.get("other")?.index, stages.get("other")?.total], [1, 1]);
  assert.equal(stages.get("loose")?.total, 1);

  // A previsão conta só pendentes de hoje em diante, dentro da janela.
  const forecast = reviewForecast(reviews, today, 14);
  assert.equal(forecast.length, 14);
  assert.deepEqual(forecast.slice(0, 2), [
    { day: today, count: 1 },
    { day: "2026-10-01", count: 1 },
  ]);
  assert.equal(forecast.reduce((sum, entry) => sum + entry.count, 0), 2);
  assert.equal(reviewForecast(reviews, today, 14, "b").reduce((sum, entry) => sum + entry.count, 0), 1);

  const punctuality = reviewPunctuality(reviews, today, "UTC", 30);
  assert.deepEqual(punctuality, { onTime: 1, late: 1, ignored: 0, total: 2 });
  assert.equal(reviewPunctuality(reviews, today, "UTC", 90).ignored, 1);
}

console.log("verify-study: review queue ok");

