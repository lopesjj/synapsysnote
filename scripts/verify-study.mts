import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { linesFromText, mergeDrafts, parseSyllabus, subjectsFromCsv, topicListFromText, smartTitle } from "../src/lib/study/syllabus";
import { pickUnseen, quoteFitsTheme, type RemoteMotto } from "../src/lib/study/mottos";
import { STUDY_DICTIONARIES } from "../src/lib/study/i18n/dictionaries.all";
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
import { streakRuns } from "../src/lib/study/awards";
import {
  currentTerm,
  intervalsBefore,
  isPastTerm,
  reviewsDroppedBy,
  seriesIdOf,
  studyWindow,
  termsOf,
  windowCovers,
} from "../src/lib/study/series";
import {
  advanceCycle,
  canCountSession,
  countSession,
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
import { archiveTargets, focusPlanOf, mergeArchive, requestedArchiveIds } from "../src/lib/study/archive";
import { studyBackendFor } from "../src/lib/study/backend";
import type { DayKey, StudyCycle, StudyPlan, StudyReview, StudySession } from "../src/types/study";

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

const gap = parseSyllabus("DIREITO PENAL: 1 Princípios básicos. 2 Aplicação da lei penal. 2.2 Lei penal no tempo. 2.2.1 Tempo do crime. 2.3 Lei penal no espaço. 3 Tipicidade.");
assert.equal(gap[0]?.name, "Direito Penal");
assert.deepEqual(gap[0]?.topics, [
  "Princípios básicos",
  "Aplicação da lei penal",
  "2.2 Lei penal no tempo",
  "2.2.1 Tempo do crime",
  "2.3 Lei penal no espaço",
  "Tipicidade",
]);

const vunesp = parseSyllabus("Língua Portuguesa: Leitura e interpretação de textos. Sinônimos e antônimos. Crase.");
assert.equal(vunesp[0]?.name, "Língua Portuguesa");
assert.deepEqual(vunesp[0]?.topics, ["Leitura e interpretação de textos", "Sinônimos e antônimos", "Crase"]);

const dashed = parseSyllabus("Língua Portuguesa - 1 Compreensão de textos. 2 Ortografia oficial. 3 Emprego da crase.");
assert.equal(dashed[0]?.name, "Língua Portuguesa");
assert.deepEqual(dashed[0]?.topics, ["Compreensão de textos", "Ortografia oficial", "Emprego da crase"]);

const hierarchical = parseSyllabus("1. NOÇÕES DE DIREITO\n1.1 Constituição Federal: artigos 1º a 5º.\n1.1.1 Constituição do Estado de São Paulo: artigos 139 a 143.\n2. CRIMINALÍSTICA\n2.1 Local de crime.");
assert.deepEqual(hierarchical.map((subject) => subject.name), ["Noções de Direito", "Criminalística"]);
assert.deepEqual(hierarchical[0]?.topics, [
  "1.1 Constituição Federal: artigos 1º a 5º",
  "1.1.1 Constituição do Estado de São Paulo: artigos 139 a 143",
]);
assert.deepEqual(hierarchical[1]?.topics, ["2.1 Local de crime"]);

const languages = parseSyllabus("LÍNGUA ESTRANGEIRA: I LÍNGUA INGLESA: 1 Compreensão de texto. 2 Itens gramaticais. II LÍNGUA ESPANHOLA: 1 Compreensão de texto. 2 Itens gramaticais.");
assert.deepEqual(languages.map((subject) => subject.name), ["Língua Inglesa", "Língua Espanhola"]);
assert.equal(languages[0]?.topics.length, 2);
assert.equal(languages[1]?.topics.length, 2);

const cargo = parseSyllabus("CARGO 2: PERITO CRIMINAL FEDERAL - ÁREA 1: CONTÁBIL\n1 Contabilidade geral. 1.1 Teoria contábil. 1.2 Estoques.\n2 Contabilidade comercial. 2.1 Operações com mercadorias.");
assert.deepEqual(cargo.map((subject) => subject.name), ["Contabilidade geral", "Contabilidade comercial"]);
assert.ok(cargo[0]?.topics.includes("1.1 Teoria contábil"));
assert.ok(cargo[1]?.topics.includes("2.1 Operações com mercadorias"));

const block = parseSyllabus("BLOCO I: Língua Portuguesa\n(16) questões:\n1. Análise de textos.\n2. Crase.");
assert.equal(block[0]?.name, "Língua Portuguesa");
assert.deepEqual(block[0]?.topics, ["Análise de textos", "Crase"]);

const apps = parseSyllabus("INFORMÁTICA: MS-Word: edição de textos. MS-Excel: planilhas e fórmulas. Internet: navegação e conceitos de URL.");
assert.equal(apps.length, 1);
assert.equal(apps[0]?.name, "Informática");
assert.ok(apps[0]?.topics.some((topic) => topic.startsWith("MS-Excel")));

const branches = parseSyllabus("Conhecimentos específicos: Estatística: Cálculo de probabilidades. Distribuição normal. Matemática Financeira: Juros simples e compostos. Taxas equivalentes.");
assert.deepEqual(branches.map((subject) => subject.name), ["Estatística", "Matemática Financeira"]);

const ethics = parseSyllabus("ÉTICA E CIDADANIA: 1 Ética e moral. 2 Ética, princípios e valores. 3 Ética e função pública: integridade. 4. Ética no setor público. 4.1 Princípios da Administração Pública: moralidade (art. 37 da CF). 4.2 Deveres dos servidores. 5 Ética e democracia: exercício da cidadania. 5.1 Transparência ativa.");
assert.deepEqual(ethics.map((subject) => subject.name), ["Ética e Cidadania"]);
assert.ok(ethics[0]?.topics.includes("Ética e função pública: integridade"));
assert.ok(ethics[0]?.topics.some((topic) => topic.startsWith("4.1 Princípios da Administração Pública")));
assert.ok(ethics[0]?.topics.includes("Ética e democracia: exercício da cidadania"));
assert.ok(ethics[0]?.topics.some((topic) => topic.startsWith("5.1 Transparência ativa")));

const statuteGap = parseSyllabus("1. NOÇÕES DE DIREITO\n1.1 Constituição Federal: artigos 1º a 5º, 16, 37, 39, 41 e 144.\n1.1.1 Constituição do Estado de São Paulo: artigos 139 a 143.\n1.2 Direito Administrativo. Administração Pública: princípios explícitos. Serviço público.");
assert.deepEqual(statuteGap.map((subject) => subject.name), ["Noções de Direito"]);
assert.ok(statuteGap[0]?.topics.some((topic) => topic.startsWith("1.1 Constituição Federal")));
assert.ok(statuteGap[0]?.topics.some((topic) => topic.startsWith("1.1.1 Constituição do Estado")));
assert.ok(statuteGap[0]?.topics.some((topic) => topic.startsWith("1.2 Direito Administrativo")));

const capsBranches = parseSyllabus("BLOCO II: Conhecimentos em Direito\n1. DIREITO PENAL: Código Penal - artigos 293 a 305.\n2. DIREITO PROCESSUAL PENAL: Código de Processo Penal - artigos 251 a 258.");
assert.deepEqual(capsBranches.map((subject) => subject.name), ["Direito Penal", "Direito Processual Penal"]);

const dashedParent = parseSyllabus("Ética e Gestão no Serviço Público - 1. Princípios e ética na Administração Pública: 1.1 Princípios constitucionais. 2. Gestão de pessoas: 2.1 Motivação.");
assert.equal(dashedParent[0]?.name, "Ética e Gestão no Serviço Público");
assert.ok(dashedParent[0]?.topics.some((topic) => topic.startsWith("1.1 Princípios constitucionais")));
assert.ok(dashedParent[0]?.topics.some((topic) => topic.startsWith("2.1 Motivação")));

const windows = parseSyllabus("INFORMÁTICA: MS-Windows 10 ou superior: conceito de pastas. MS-\nExcel: planilhas e fórmulas.");
assert.equal(windows.length, 1);
assert.ok(windows[0]?.topics.some((topic) => topic.startsWith("MS-Windows 10")));
assert.ok(windows[0]?.topics.some((topic) => topic.startsWith("MS-Excel")));

const component = parseSyllabus("Componente: Língua Portuguesa\nHabilidades (1):\nAnalisar textos noticiosos.\nObjetos de conhecimento:\n• Parcialidade em textos noticiosos.\n• Comparação de fontes.");
assert.equal(component[0]?.name, "Língua Portuguesa");
assert.ok(component[0]?.topics.includes("Analisar textos noticiosos"));
assert.ok(component[0]?.topics.some((topic) => topic.startsWith("Parcialidade")));
assert.ok(component[0]?.topics.some((topic) => topic.startsWith("Comparação")));

const skill = parseSyllabus("Componente: Língua Portuguesa\nDistinguir o uso contemporâneo de tópicos gramaticais daquele estipulado pela norma\npadrão da língua.");
assert.deepEqual(skill.map((subject) => subject.name), ["Língua Portuguesa"]);
assert.ok(skill[0]?.topics[0]?.includes("padrão da língua"));

const siblingLaw = parseSyllabus("DIREITO PROCESSUAL CIVIL: 3.2 Lei n.º 9.099 de 26.09.1995 e 3.3 Lei n.º 12.153 de 22/12/2009.");
assert.ok(siblingLaw[0]?.topics.some((topic) => topic.startsWith("3.2 Lei")));
assert.ok(siblingLaw[0]?.topics.some((topic) => topic.startsWith("3.3 Lei")));

const wrapped = parseSyllabus("LÍNGUA PORTUGUESA: 1 Compreensão e interpretação de textos verbais, não verbais,\nliterários e não literários. 2 Crase.");
assert.equal(wrapped[0]?.topics[0], "Compreensão e interpretação de textos verbais, não verbais, literários e não literários");

const statute = parseSyllabus("DIREITO CONSTITUCIONAL: 1 Direitos e garantias conforme a Lei nº 8.112/1990 e art. 5º da CF. 2 Organização do Estado.");
assert.equal(statute[0]?.topics.length, 2);
assert.match(statute[0]?.topics[0] ?? "", /8\.112\/1990/);
assert.match(statute[0]?.topics[0] ?? "", /art\. 5º/);

const repeated = parseSyllabus("CRIMINALÍSTICA: 1 Vestígios. 1.1 Sinais de morte. 1.1 Cronotanatognose e alterações cadavéricas. 1.2 Traumatologia.");
assert.ok(repeated[0]?.topics.some((topic) => topic.includes("Sinais de morte")));
assert.ok(repeated[0]?.topics.some((topic) => topic.includes("Cronotanatognose")));

const longTopic = "1 " + "Resolução 000/2000; ".repeat(40);
const fitted = parseSyllabus(`LEGISLAÇÃO: ${longTopic} 2 Crase.`);
assert.ok((fitted[0]?.topics.length ?? 0) > 1);
assert.ok(fitted[0]?.topics.every((topic) => topic.length <= 300));
assert.ok(fitted[0]?.topics.join(" ").includes("Resolução 000/2000"));
assert.ok(fitted[0]?.topics.includes("Crase"));

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

// Só o idioma em uso deve ir para o navegador. `dictionaries.all` junta os dez
// e existe para esta varredura: se o app importar, os dez voltam para o pacote
// do layout — ou seja, para toda página, inclusive as de notas.
{
  const roots = ["src"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const text = readFileSync(full, "utf8");
      if (/from\s+["'][^"']*dictionaries\.all["']/.test(text)) offenders.push(full);
      // O carregador tem de ser dinâmico: um `import` estático de outro idioma
      // em dictionaries.ts anula a divisão.
      if (full.endsWith(join("study", "i18n", "dictionaries.ts"))) {
        const statics = [...text.matchAll(/^import\s+\{[^}]*\}\s+from\s+"\.\/([a-z]{2})"/gm)].map((match) => match[1]);
        for (const code of statics) if (code !== "pt") offenders.push(`${full} (import estático de ${code})`);
      }
    }
  };
  for (const root of roots) walk(root);
  assert.deepEqual(offenders, [], `dicionários de estudo carregados por inteiro no app: ${offenders.join(", ")}`);
}
console.log("verify-study: dicionários divididos por idioma ok");

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

// Disciplina que já ficou para trás do ponteiro continua contando no planejamento:
// o tempo fecha a volta dela e a próxima da vez segue sendo a mesma.
const aheadIndex = items.length - 1;
const behindIndex = items.findIndex((item) => item.subjectId !== items[aheadIndex].subjectId);
const behindSubject = items[behindIndex].subjectId;
const movedOn = { ...cycle, pointer: aheadIndex };
assert.equal(canCountSession(movedOn, behindSubject, monday, false), false);
assert.equal(canCountSession(movedOn, behindSubject, monday, true), true);
const behindCount = countSession(
  { ...movedOn, progress: {} },
  { subjectId: behindSubject, day: monday, durationSec: items[behindIndex].minutes * 60 },
  "s-behind",
  3,
  { outOfTurn: true }
);
assert.ok(behindCount);
assert.equal(behindCount.cycleItemId, items[behindIndex].id);
assert.equal(behindCount.cycle.pointer, aheadIndex, "contar atrás da vez não puxa o ponteiro de volta");
assert.equal(behindCount.cycle.history.at(-1)?.itemId, items[behindIndex].id);
assert.equal(lapStates(behindCount.cycle)[behindIndex], "done");
assert.equal(lapStates(behindCount.cycle)[aheadIndex], "current");
const behindUndone = undoLastCompletion(behindCount.cycle);
assert.ok(behindUndone);
assert.equal(behindUndone.pointer, aheadIndex, "desfazer esse registro também não mexe no ponteiro");
assert.equal(behindUndone.history.length, behindCount.cycle.history.length - 1);

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

assert.equal(quoteFitsTheme("Beauty is not in the face; beauty is a light in the heart."), false);
assert.equal(quoteFitsTheme("Perseverance and spirit have done wonders in all ages."), true);
const catalog: RemoteMotto[] = Array.from({ length: 12 }, (_, index) => ({
  id: index.toString(16).padStart(20, "a"),
  text: `Perseverance carries goal ${index} through the setback.`,
  author: "Test",
}));
const seen: string[] = [];
for (let day = 0; day < catalog.length; day += 1) {
  const next = pickUnseen(catalog, seen);
  assert.ok(next);
  assert.equal(seen.includes(next.id), false);
  seen.push(next.id);
}
assert.equal(pickUnseen(catalog, seen), null);
assert.equal(new Set(seen).size, catalog.length);

console.log("verify-study: ok");

// Dia livre vem da semana de estudo: o domingo fica livre antes do início, no passado e no futuro, e só estudar no dia muda isso.
{
  const studied = new Set(["2026-09-21", "2026-09-23"]);
  const weekdays = [1, 2, 3, 4, 5];
  const today = "2026-09-29";
  assert.equal(dayStatus("2026-09-20", studied, "2026-09-21", today, weekdays), "rest");
  assert.equal(dayStatus("2026-10-04", studied, "2026-09-21", today, weekdays), "rest");
  assert.equal(dayStatus("2026-09-20", new Set(["2026-09-20"]), "2026-09-20", today, weekdays), "studied");
  assert.equal(dayStatus("2026-09-18", studied, "2026-09-21", today, weekdays), "before");
  assert.equal(dayStatus("2026-09-21", studied, "2026-09-21", today, weekdays), "studied");
  assert.equal(dayStatus("2026-09-22", studied, "2026-09-21", today, weekdays), "missed");
  assert.equal(dayStatus("2026-09-27", studied, "2026-09-21", today, weekdays), "rest");
  assert.equal(dayStatus("2026-09-29", studied, "2026-09-21", today, weekdays), "pending");
  assert.equal(dayStatus("2026-09-30", studied, "2026-09-21", today, weekdays), "future");
  assert.equal(dayStatus("2026-09-27", studied, "2026-09-21", today, []), "missed");
  assert.equal(dayStatus("2026-09-22", studied, null, today, weekdays), "before");
}

console.log("verify-study: day status ok");

// --- Editais: janela de contagem, corte das revisoes na prova e soma da serie ---

const termPlan = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    name: "Objetivo",
    institution: "",
    role: "",
    examDate: null,
    icon: null,
    notes: "",
    archived: false,
    weeklyGoalMinutes: 0,
    weeklyGoalQuestions: 0,
    order: 0,
    seriesId: id,
    termLabel: "",
    startDay: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }) as StudyPlan;

const everyWeekday = [0, 1, 2, 3, 4, 5, 6];
// Sem prova marcada, tudo entra na contagem.
const openWindow = studyWindow([{ startDay: null, examDate: null }], new Set<DayKey>());
assert.equal(windowCovers(openWindow, "2026-01-01"), true);

// Antes do inicio do edital nada conta.
const startedWindow = studyWindow([{ startDay: "2026-03-10", examDate: "2026-04-03" }], new Set<DayKey>());
assert.equal(windowCovers(startedWindow, "2026-03-09"), false);
assert.equal(windowCovers(startedWindow, "2026-03-10"), true);
assert.equal(windowCovers(startedWindow, "2026-04-03"), true);
// Passada a prova, sem registro novo, os dias nao viram falha.
assert.equal(windowCovers(startedWindow, "2026-04-04"), false);
assert.equal(windowCovers(startedWindow, "2026-12-31"), false);
assert.equal(startedWindow.pauses[0]?.until, null);

// Com um registro depois da prova, a contagem recomeca nesse dia.
const resumed = studyWindow([{ startDay: "2026-03-10", examDate: "2026-04-03" }], new Set<DayKey>(["2026-03-11", "2026-05-02", "2026-05-20"]));
assert.equal(resumed.pauses[0]?.until, "2026-05-02");
assert.equal(windowCovers(resumed, "2026-04-20"), false, "o intervalo entre a prova e a volta fica neutro");
assert.equal(windowCovers(resumed, "2026-05-02"), true);
assert.equal(windowCovers(resumed, "2026-05-10"), true);

// Voltar no dia seguinte a prova nao deixa trecho neutro nenhum: sem prova nova
// marcada, o dia perdido volta a valer normalmente.
const noGap = studyWindow([{ startDay: null, examDate: "2026-04-03" }], new Set<DayKey>(["2026-04-04"]));
assert.deepEqual(noGap.pauses, []);
assert.equal(windowCovers(noGap, "2026-04-04"), true);
assert.equal(windowCovers(noGap, "2026-04-05"), true, "parou de novo, mas sem prova nova o X continua");

// Serie de dois editais: o calendario cobre os dois, e a pausa entre eles fecha
// no dia em que o edital novo comeca.
const twoTerms = studyWindow(
  [
    { startDay: "2026-01-05", examDate: "2026-04-03" },
    { startDay: "2026-06-01", examDate: "2026-10-26" },
  ],
  new Set<DayKey>(["2026-01-06", "2026-03-02"])
);
assert.equal(twoTerms.startDay, "2026-01-05");
assert.equal(windowCovers(twoTerms, "2026-01-04"), false, "antes do primeiro edital");
assert.equal(windowCovers(twoTerms, "2026-02-10"), true, "dentro do primeiro edital");
assert.equal(windowCovers(twoTerms, "2026-04-20"), false, "entre a prova e o edital seguinte");
assert.equal(windowCovers(twoTerms, "2026-06-01"), true, "o edital novo retoma a contagem");
assert.equal(windowCovers(twoTerms, "2026-09-15"), true);
assert.equal(windowCovers(twoTerms, "2026-10-27"), false, "depois da prova do edital novo");

// Edital antigo sem dia de inicio nao pode ser apagado pelo inicio do edital novo:
// a serie fica sem piso e os dias perdidos de antes continuam contando.
const legacySeries = studyWindow(
  [
    { startDay: null, examDate: "2026-06-28" },
    { startDay: "2026-10-07", examDate: "2026-10-25" },
  ],
  new Set<DayKey>(["2026-04-27", "2026-05-18"])
);
assert.equal(legacySeries.startDay, null, "um edital sem startDay tira o piso da serie");
assert.equal(windowCovers(legacySeries, "2026-04-29"), true, "dia perdido do edital antigo ainda conta");
assert.equal(dayStatus("2026-04-29", new Set<DayKey>(["2026-04-27"]), "2026-04-27", "2026-10-07", everyWeekday, legacySeries), "missed");
assert.equal(windowCovers(legacySeries, "2026-08-01"), false, "entre a prova antiga e o edital novo segue neutro");

// Estudou depois da prova e nenhuma prova nova foi marcada: o X volta normal e
// segue valendo, inclusive anos depois.
const resumedDays = new Set<DayKey>(["2022-05-16", "2022-06-04", "2022-06-05", "2022-06-07"]);
const quiet = studyWindow([{ startDay: null, examDate: "2022-05-22" }], resumedDays);
assert.equal(windowCovers(quiet, "2022-05-16"), true, "antes da prova conta normalmente");
assert.equal(windowCovers(quiet, "2022-05-30"), false, "entre a prova e a volta fica neutro");
assert.equal(windowCovers(quiet, "2022-06-06"), true, "falha no meio da volta e dia perdido");
assert.equal(windowCovers(quiet, "2022-06-08"), true, "sem prova nova, o X continua depois do ultimo registro");
assert.equal(windowCovers(quiet, "2026-09-15"), true);
assert.equal(dayStatus("2022-06-06", new Set<DayKey>(), "2022-05-16", "2026-10-07", everyWeekday, quiet), "missed");

// Marcando uma prova nova, o trecho entre o ultimo registro e o inicio do novo
// edital e limpo — e so ele.
const restarted = studyWindow(
  [
    { startDay: null, examDate: "2022-05-22" },
    { startDay: "2026-10-07", examDate: "2026-12-01" },
  ],
  resumedDays
);
assert.equal(windowCovers(restarted, "2022-06-06"), true, "a falha dentro da volta continua sendo X");
assert.equal(windowCovers(restarted, "2022-06-08"), false, "do ultimo registro ate o inicio novo fica limpo");
assert.equal(windowCovers(restarted, "2026-09-15"), false);
assert.equal(dayStatus("2026-09-15", new Set<DayKey>(), null, "2026-10-20", everyWeekday, restarted), "paused");
assert.equal(windowCovers(restarted, "2026-10-07"), true, "do inicio do edital novo em diante conta de novo");
assert.equal(dayStatus("2026-10-08", new Set<DayKey>(), "2022-05-16", "2026-10-20", everyWeekday, restarted), "missed");

// Sem registro nenhum depois da prova, nada e cobrado dali em diante.
const neverBack = studyWindow([{ startDay: null, examDate: "2022-05-22" }], new Set<DayKey>(["2022-05-16"]));
assert.equal(windowCovers(neverBack, "2022-05-23"), false);
assert.equal(windowCovers(neverBack, "2026-09-15"), false);

assert.equal(dayStatus("2026-04-20", new Set<DayKey>(), "2026-03-10", "2026-06-01", everyWeekday, startedWindow), "paused");
assert.equal(dayStatus("2026-03-20", new Set<DayKey>(), "2026-03-10", "2026-06-01", everyWeekday, startedWindow), "missed");
assert.equal(dayStatus("2026-05-10", new Set<DayKey>(), "2026-03-10", "2026-06-01", everyWeekday, resumed), "missed", "depois da volta o X volta");
assert.equal(dayStatus("2026-04-20", new Set<DayKey>(), "2026-03-10", "2026-06-01", everyWeekday, resumed), "paused");

// A pausa nao quebra a sequencia: estudou antes da prova e voltou depois.
const pausedDays = new Set<DayKey>(["2026-04-01", "2026-04-02", "2026-04-03", "2026-05-02"]);
const pausedWindow = studyWindow([{ startDay: "2026-03-10", examDate: "2026-04-03" }], pausedDays);
assert.equal(streakInfo(pausedDays, "2026-05-02", everyWeekday, pausedWindow).current, 4);
assert.equal(streakInfo(pausedDays, "2026-05-02", everyWeekday).current, 1, "sem a janela, o intervalo zera a sequencia");

// Nada e marcado para o dia da prova em diante.
assert.deepEqual(intervalsBefore([1, 7, 30], "2026-04-01", "2026-04-03"), [1]);
assert.deepEqual(intervalsBefore([1, 7, 30], "2026-04-01", null), [1, 7, 30]);
assert.deepEqual(intervalsBefore([1, 7, 30], "2026-04-02", "2026-04-03"), [], "um dia antes da prova ja nao cabe nada");

const pendingReviews = [
  { id: "a", status: "pending", dueDay: "2026-04-02" },
  { id: "b", status: "pending", dueDay: "2026-04-03" },
  { id: "c", status: "pending", dueDay: "2026-05-01" },
  { id: "d", status: "done", dueDay: "2026-05-01" },
];
assert.deepEqual(reviewsDroppedBy(pendingReviews, "2026-04-03").map((entry) => entry.id), ["b", "c"]);
assert.deepEqual(reviewsDroppedBy(pendingReviews, null), []);

// Serie de editais: o antigo fica arquivado e o atual e o mais novo em aberto.
const first = termPlan("p1", { examDate: "2026-04-03", archived: true, createdAt: 10 });
const second = termPlan("p2", { seriesId: "p1", termLabel: "Edital 2027", examDate: "2026-10-26", createdAt: 20 });
const other = termPlan("p9", { createdAt: 5 });
const everyPlan = [second, other, first];
assert.equal(seriesIdOf(first), "p1");
assert.equal(seriesIdOf(second), "p1");
assert.deepEqual(termsOf(everyPlan, "p1").map((plan) => plan.id), ["p1", "p2"]);
assert.equal(currentTerm(everyPlan, "p1")?.id, "p2");
assert.equal(currentTerm(everyPlan, "p9")?.id, "p9");
// Serie inteira arquivada ainda tem um edital corrente para a tela mostrar.
assert.equal(currentTerm([termPlan("solo", { archived: true })], "solo")?.id, "solo");

// Edital anterior e historico da serie, nao objetivo arquivado pelo usuario.
assert.equal(isPastTerm(everyPlan, first), true);
assert.equal(isPastTerm(everyPlan, second), false);
assert.equal(isPastTerm(everyPlan, other), false, "objetivo de serie propria nunca e edital anterior");
// Serie inteira arquivada volta a ser arquivo comum: a lista precisa mostrar algo.
const bothArchived = [first, { ...second, archived: true }];
assert.equal(isPastTerm(bothArchived, first), false);

// Os selos de sequencia contam a corrida com a mesma janela: nunca pode faltar
// menos que zero para o proximo selo.
const sealDays = new Set<DayKey>(["2026-04-01", "2026-04-02", "2026-04-03", "2026-05-02", "2026-05-03"]);
const sealWindow = studyWindow([{ startDay: "2026-03-10", examDate: "2026-04-03" }], sealDays);
const openRuns = streakRuns(sealDays, "2026-05-03", everyWeekday);
const pausedRuns = streakRuns(sealDays, "2026-05-03", everyWeekday, sealWindow);
assert.equal(Math.max(...openRuns.map((run) => run.length)), 3, "sem a janela a pausa corta a corrida");
assert.equal(Math.max(...pausedRuns.map((run) => run.length)), 5, "com a janela a corrida atravessa a pausa");
assert.equal(streakInfo(sealDays, "2026-05-03", everyWeekday, sealWindow).current, 5);

// Adiantar meia hora numa disciplina mais a frente nao pode pular as anteriores:
// so fechar o bloco move o ponteiro, e desfazer devolve a volta ao lugar.
const aheadCycle = {
  items: [
    { id: "x0", subjectId: "a", minutes: 60 },
    { id: "x1", subjectId: "b", minutes: 60 },
    { id: "x2", subjectId: "c", minutes: 60 },
  ],
  agenda: [],
  pointer: 0,
  round: 0,
  history: [],
  progress: {},
};
const partial = countSession(aheadCycle, { subjectId: "c", day: monday, durationSec: 1800 }, "sp", 1, { outOfTurn: true });
assert.ok(partial);
assert.equal(partial.cycle.pointer, 0, "meia sessao fora da vez nao move o ponteiro");
assert.equal(partial.cycle.progress["x2:0"], 30);

const whole = countSession(aheadCycle, { subjectId: "c", day: monday, durationSec: 3600 }, "sw", 2, { outOfTurn: true });
assert.ok(whole);
assert.equal(whole.cycle.pointer, 0, "fechar o ultimo bloco vira a volta");
assert.equal(whole.cycle.round, 1);
assert.equal(whole.cycle.history.at(-1)?.from, 0, "o registro guarda de onde o ponteiro saiu");
const undoneAhead = undoLastCompletion(whole.cycle);
assert.ok(undoneAhead);
assert.equal(undoneAhead.pointer, 0, "desfazer devolve o ponteiro para a disciplina da vez");
assert.equal(undoneAhead.round, 0);

const midAhead = countSession(aheadCycle, { subjectId: "b", day: monday, durationSec: 3600 }, "sm", 3, { outOfTurn: true });
assert.ok(midAhead);
assert.equal(midAhead.cycle.pointer, 2, "fechar fora da vez segue para a proxima");
const undoneMid = undoLastCompletion(midAhead.cycle);
assert.equal(undoneMid?.pointer, 0, "desfazer volta para onde estava, nao para a disciplina contada");

console.log("verify-study: terms ok");


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


// --- Histórico arquivado fora da assinatura ---------------------------------
// Registros, revisões e simulados de objetivo arquivado não são assinados: eles
// são lidos sob demanda e juntados ao que está em memória. Estas checagens
// fixam quem é buscado, o que entra na junção e o que nunca pode duplicar.

const planOf = (id: string, over: Partial<StudyPlan> = {}): StudyPlan => ({
  id,
  name: id,
  institution: "",
  role: "",
  examDate: null,
  icon: null,
  notes: "",
  archived: false,
  weeklyGoalMinutes: 0,
  weeklyGoalQuestions: 0,
  order: 0,
  seriesId: id,
  termLabel: "",
  startDay: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

{
  const open = planOf("aberto");
  const arquivado = planOf("arquivado", { archived: true });
  const plans = [open, arquivado];

  // Objetivo em foco: o ativo; navegar no arquivo troca o foco para o arquivado.
  assert.equal(focusPlanOf(plans, "aberto", null)?.id, "aberto");
  assert.equal(focusPlanOf(plans, "aberto", "arquivado")?.id, "arquivado");
  // Só objetivo realmente arquivado pode ser navegado como arquivo.
  assert.equal(focusPlanOf(plans, "aberto", "aberto")?.id, "aberto");
  // Sem ativo marcado, vale o primeiro aberto — nunca um arquivado.
  assert.equal(focusPlanOf(plans, null, null)?.id, "aberto");
  assert.equal(focusPlanOf([arquivado], null, null), null);

  // Objetivo arquivado solto não é buscado sem alguém pedir.
  assert.deepEqual(archiveTargets(plans, open, null), []);
  // Navegar nele busca.
  assert.deepEqual(archiveTargets(plans, arquivado, "arquivado"), ["arquivado"]);
}

{
  // Série de editais: o anterior fica arquivado e o tempo total soma os dois,
  // então o histórico dele precisa vir mesmo sem ninguém abrir o arquivo.
  const antigo = planOf("edital1", { archived: true, seriesId: "serie" });
  const atual = planOf("edital2", { seriesId: "serie", createdAt: 10 });
  const outro = planOf("outro", { archived: true, seriesId: "outro" });
  const plans = [antigo, atual, outro];
  assert.deepEqual(archiveTargets(plans, atual, null), ["edital1"]);
  // O objetivo arquivado de outra série continua de fora.
  assert.ok(!archiveTargets(plans, atual, null).includes("outro"));
  // O próprio edital em foco nunca entra na lista de busca.
  assert.ok(!archiveTargets(plans, antigo, "edital1").includes("edital2"));
}

{
  const sessionAt = (id: string, day: DayKey, createdAt = 0): StudySession => ({ ...session({ id, day }), createdAt });
  const live = {
    sessions: [sessionAt("viva", "2026-03-02")],
    reviews: [] as StudyReview[],
    exams: [] as MockExam[],
  };
  const slice = {
    sessions: [sessionAt("velha", "2021-05-01"), sessionAt("viva", "2026-03-02")],
    reviews: [] as StudyReview[],
    exams: [] as MockExam[],
  };

  // Sem histórico pedido, o estado passa intacto (mesma referência).
  assert.equal(mergeArchive(live, []), live);

  const merged = mergeArchive(live, [slice]);
  // O id manda: a sessão que já veio pela assinatura não aparece duas vezes.
  assert.equal(merged.sessions.filter((entry) => entry.id === "viva").length, 1);
  assert.equal(merged.sessions.length, 2);
  // E a ordem do diário (mais recente primeiro) vale para o conjunto todo.
  assert.deepEqual(merged.sessions.map((entry) => entry.id), ["viva", "velha"]);
  // A junção não altera o que estava em memória.
  assert.equal(live.sessions.length, 1);
}
console.log("verify-study: histórico arquivado sob demanda ok");

// --- Escopo da assinatura (vale igual no modo convidado) ---------------------
// O backend local espelha o recorte do Firestore: o que a tela mostra não pode
// mudar conforme o backend. Lista vazia precisa avisar mesmo assim, senão o
// módulo fica preso no carregando quando não há objetivo aberto.
{
  const backend = studyBackendFor("local", "verify");
  await backend.commit([
    { kind: "set", collection: "study_sessions", id: "s1", data: { planId: "A", day: "2026-01-01" } },
    { kind: "set", collection: "study_sessions", id: "s2", data: { planId: "B", day: "2026-01-02" } },
  ]);
  const read = async (planIds: readonly string[] | null) => {
    const seen: string[][] = [];
    const stop = backend.subscribe("study_sessions", (docs) => seen.push(docs.map((doc) => doc.id)), undefined, planIds);
    await new Promise((resolve) => setTimeout(resolve, 10));
    stop();
    return seen;
  };
  assert.deepEqual(await read(["A"]), [["s1"]], "assinatura com escopo traz só o objetivo pedido");
  // O backend local é um só no processo: outras checagens já gravaram nele, e o
  // que importa aqui é que sem escopo nada é filtrado.
  const [unscoped] = await read(null);
  assert.ok(unscoped.includes("s1") && unscoped.includes("s2"), "sem escopo, a coleção inteira");
  assert.ok(unscoped.length > 2, "sem escopo, nada é filtrado");
  assert.deepEqual(await read([]), [[]], "sem objetivo aberto, avisa vazio em vez de nunca avisar");
  assert.deepEqual((await backend.fetch("study_sessions", "B")).map((doc) => doc.id), ["s2"]);
  await backend.commit([
    { kind: "delete", collection: "study_sessions", id: "s1" },
    { kind: "delete", collection: "study_sessions", id: "s2" },
  ]);
}
console.log("verify-study: escopo das assinaturas ok");

// Pedido de histórico arquivado por tela: sair da tela libera. Sem isso, abrir
// a gaveta de arquivados uma vez deixaria o histórico inteiro sendo juntado e
// reordenado a cada snapshot pelo resto da sessão.
{
  assert.deepEqual(requestedArchiveIds({}), []);
  assert.deepEqual(requestedArchiveIds({ gaveta: ["b", "a"], detalhe: ["a", "c"] }), ["a", "b", "c"]);
  // Tela que saiu apaga o próprio registro e some da união.
  assert.deepEqual(requestedArchiveIds({ gaveta: [], detalhe: ["a"] }), ["a"]);
  assert.deepEqual(requestedArchiveIds({ gaveta: [] }), []);
}
console.log("verify-study: pedidos de arquivo liberáveis ok");
