import assert from "node:assert/strict";
import { LOCALES, GEO_COOKIE_MAX_AGE, LOCALE_COOKIE_MAX_AGE } from "../src/lib/i18n/locale";
import { TRANSLATIONS, type TranslationKey } from "../src/lib/i18n/translations";
import { REMEMBER_DAYS } from "../src/lib/auth/remember";
import { CONSENT_MAX_AGE } from "../src/lib/legal/consent";
import { LEGAL_FACTS, legalPlaceholders } from "../src/lib/legal/entity";
import { LEGAL_LOADERS } from "../src/lib/legal/load";
import { LEGAL_DOC_IDS, type LegalBlock, type LegalBundle, type LegalDocId } from "../src/lib/legal/types";
import type { SupportedLanguage } from "../src/types/models";

const DAY = 60 * 60 * 24;
const only = process.argv[2] as SupportedLanguage | undefined;
const failures: string[] = [];

function check(condition: unknown, message: string) {
  if (!condition) failures.push(message);
}

console.log("Verificando documentos legais...");

assert.equal(LEGAL_FACTS.rememberDays, REMEMBER_DAYS);
assert.equal(LEGAL_FACTS.geoDays * DAY, GEO_COOKIE_MAX_AGE);
assert.equal(Math.round(CONSENT_MAX_AGE / DAY / 30.4), LEGAL_FACTS.consentMonths);
assert.equal(Math.round(LOCALE_COOKIE_MAX_AGE / DAY / 30.4), 12);

const TITLE_KEYS: Record<LegalDocId, TranslationKey> = {
  terms: "legal_terms",
  privacy: "legal_privacy",
  cookies: "legal_cookies",
};

const placeholders = new Set(Object.keys(legalPlaceholders()));

function textsOf(block: LegalBlock): string[] {
  if (typeof block === "string") return [block];
  if ("list" in block) return block.list;
  if ("table" in block) return [...block.table.head, ...block.table.rows.flat()];
  return [block.note];
}

function kindOf(block: LegalBlock): string {
  if (typeof block === "string") return "text";
  if ("list" in block) return `list:${block.list.length}`;
  if ("table" in block) return `table:${block.table.head.length}x${block.table.rows.map((row) => row.length).join(",")}`;
  return "note";
}

function tokens(text: string, pattern: RegExp): string[] {
  return Array.from(text.matchAll(pattern), (match) => match[1] ?? match[0]).sort();
}

function stringsOf(bundle: LegalBundle, doc: LegalDocId): { path: string; text: string }[] {
  const document = bundle[doc];
  const out = [
    { path: `${doc}.title`, text: document.title },
    { path: `${doc}.lead`, text: document.lead },
  ];
  document.highlights.forEach((highlight, index) => {
    out.push({ path: `${doc}.highlights[${index}].title`, text: highlight.title });
    out.push({ path: `${doc}.highlights[${index}].text`, text: highlight.text });
  });
  for (const section of document.sections) {
    out.push({ path: `${doc}.${section.id}.title`, text: section.title });
    section.blocks.forEach((block, index) => {
      textsOf(block).forEach((text, item) => out.push({ path: `${doc}.${section.id}[${index}][${item}]`, text }));
    });
  }
  return out;
}

const bundles = new Map<SupportedLanguage, LegalBundle>();
for (const language of LOCALES) {
  const loader = LEGAL_LOADERS[language];
  check(loader, `${language}: sem loader em LEGAL_LOADERS`);
  if (loader) bundles.set(language, (await loader()).default);
}

const source = bundles.get("pt")!;

for (const language of LOCALES) {
  if (only && language !== only) continue;
  const bundle = bundles.get(language);
  if (!bundle) continue;
  const ui = TRANSLATIONS[language] as Record<TranslationKey, string>;

  for (const doc of LEGAL_DOC_IDS) {
    const reference = source[doc];
    const document = bundle[doc];
    check(document, `${language}.${doc}: documento ausente`);
    if (!document) continue;

    check(document.title === ui[TITLE_KEYS[doc]], `${language}.${doc}: título "${document.title}" difere da interface "${ui[TITLE_KEYS[doc]]}"`);
    check(
      document.highlights.length === reference.highlights.length,
      `${language}.${doc}: ${document.highlights.length} destaques, esperado ${reference.highlights.length}`
    );
    check(
      document.sections.map((section) => section.id).join() === reference.sections.map((section) => section.id).join(),
      `${language}.${doc}: seções diferentes do pt`
    );

    document.sections.forEach((section, index) => {
      const expected = reference.sections[index];
      if (!expected || expected.id !== section.id) return;
      check(
        section.blocks.map(kindOf).join("|") === expected.blocks.map(kindOf).join("|"),
        `${language}.${doc}.${section.id}: blocos [${section.blocks.map(kindOf).join("|")}] diferentes de [${expected.blocks.map(kindOf).join("|")}]`
      );
    });

    const own = stringsOf(bundle, doc);
    const base = new Map(stringsOf(source, doc).map((entry) => [entry.path, entry.text]));
    for (const { path, text } of own) {
      check(text.trim().length > 0, `${language}.${path}: texto vazio`);
      const original = base.get(path);
      if (original === undefined) continue;
      const found = tokens(text, /\{(\w+)\}/g);
      for (const name of found) check(placeholders.has(name), `${language}.${path}: placeholder desconhecido {${name}}`);
      const expected = tokens(original, /\{(\w+)\}/g);
      const extra = [...found];
      for (const name of expected) {
        const index = extra.indexOf(name);
        if (index === -1) extra.push(`-${name}`);
        else extra.splice(index, 1);
      }
      check(
        extra.every((name) => name === "brand"),
        `${language}.${path}: placeholders ${found.join()} diferem do pt (${expected.join()})`
      );
      check(
        tokens(text, /\]\(([^)\s]+)\)/g).join() === tokens(original, /\]\(([^)\s]+)\)/g).join(),
        `${language}.${path}: destinos de link diferem do pt`
      );
      check(
        (text.match(/\*\*/g) ?? []).length === (original.match(/\*\*/g) ?? []).length,
        `${language}.${path}: quantidade de trechos em negrito difere do pt`
      );
      for (const match of text.matchAll(/\]\(doc:([a-z]+)(?:#([\w-]+))?\)/g)) {
        const target = bundle[match[1] as LegalDocId];
        check(target, `${language}.${path}: link para documento inexistente ${match[1]}`);
        if (target && match[2]) {
          check(
            target.sections.some((section) => section.id === match[2]),
            `${language}.${path}: link para seção inexistente ${match[1]}#${match[2]}`
          );
        }
      }
    }

    if (doc === "cookies") {
      const control = document.sections.find((section) => section.id === "control");
      const first = control?.blocks[0];
      check(
        typeof first === "string" && first.includes(ui.cookie_preferences),
        `${language}.cookies.control: o texto não cita o rótulo "${ui.cookie_preferences}" da interface`
      );
      const list = document.sections.find((section) => section.id === "list")?.blocks[0];
      const names = list && typeof list === "object" && "table" in list ? list.table.rows.map((row) => row[0]) : [];
      const expectedList = reference.sections.find((section) => section.id === "list")?.blocks[0];
      const expectedNames =
        expectedList && typeof expectedList === "object" && "table" in expectedList
          ? expectedList.table.rows.map((row) => row[0])
          : [];
      check(names.join() === expectedNames.join(), `${language}.cookies.list: nomes de cookies diferem do pt`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `  - ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Documentos legais consistentes em ${only ?? LOCALES.length + " idiomas"}.`);
