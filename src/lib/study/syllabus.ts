import { MAX_NAME_LENGTH, MAX_TOPIC_LENGTH, nextSubjectColor } from "./defaults";
import type { SubjectDraft } from "./provider";

export interface ParsedSubject {
  name: string;
  topics: string[];
}

const CONNECTORS = new Set([
  "a", "à", "ao", "aos", "as", "às", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos",
  "o", "os", "ou", "para", "pela", "pelas", "pelo", "pelos", "por", "sem", "sob", "sobre", "um", "uma",
  "and", "of", "the", "in", "to", "for", "on", "at", "by", "with",
  "y", "del", "la", "las", "los", "el", "en", "con",
  "et", "des", "du", "le", "les", "au", "aux",
  "di", "della", "delle", "dei", "degli", "il", "lo", "gli", "ed",
  "und", "der", "die", "das", "von", "zu", "im", "für",
]);

const ROMAN = /^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;
const REFERENCE_BEFORE = /(?:^|[^\p{L}])(?:art|arts|artigo|artigos|lei|n[º°o]|decreto|súmula|sumula|inciso|incisos|emenda|ec|cap|capítulo|capitulo|item|itens|anexo|resolução|resolucao|portaria|instrução|instrucao|p|pp|pág|pag|vol|seção|secao|título|titulo|alínea|alinea)\.?\s*$|§\s*$/iu;

function letterStats(value: string) {
  let upper = 0;
  let letters = 0;
  for (const char of value) {
    const lower = char.toLowerCase();
    const upperChar = char.toUpperCase();
    if (lower === upperChar) continue;
    letters += 1;
    if (char === upperChar) upper += 1;
  }
  return { upper, letters };
}

function mostlyUpper(value: string): boolean {
  const { upper, letters } = letterStats(value);
  return letters >= 3 && upper / letters >= 0.7;
}

function hasVowel(word: string): boolean {
  return /[aeiouyàáâãäåèéêëìíîïòóôõöùúûüýаеёиоуыэюяаеиоуыэюя]/i.test(word);
}

export function smartTitle(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!mostlyUpper(clean)) return clean;
  return clean
    .split(" ")
    .map((word, index) => {
      const bare = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (!bare) return word;
      if (ROMAN.test(bare) || /\d/.test(bare) || bare.length <= 2 && !CONNECTORS.has(bare.toLowerCase())) return word;
      if (!hasVowel(bare)) return word;
      const lower = word.toLowerCase();
      if (index > 0 && CONNECTORS.has(bare.toLowerCase())) return lower;
      const firstLetter = lower.search(/\p{L}/u);
      if (firstLetter < 0) return lower;
      return lower.slice(0, firstLetter) + lower.charAt(firstLetter).toUpperCase() + lower.slice(firstLetter + 1);
    })
    .join(" ");
}

function cleanTopic(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—•·▪◦*>]+/, "")
    .replace(/^[a-z]\)\s+/i, "")
    .replace(/[\s.;,:]+$/, "")
    .trim()
    .slice(0, MAX_TOPIC_LENGTH);
}

function cleanSubjectName(value: string): string {
  const stripped = value
    .replace(/^[\s\-–—•·▪◦*>]+/, "")
    .replace(/^(?:\d{1,2}|[ivxlcdm]{1,5})[.)\-–]\s+/i, "")
    .replace(/[\s:.\-–]+$/, "")
    .trim();
  return smartTitle(stripped).slice(0, MAX_NAME_LENGTH);
}

type NumberPath = number[];

function parsePath(label: string): NumberPath {
  return label.split(".").filter(Boolean).map(Number);
}

function isSuccessor(previous: NumberPath | null, next: NumberPath): boolean {
  if (!previous) return next.length === 1 && next[0] <= 3;
  if (next.length === previous.length + 1 && next[next.length - 1] === 1) {
    return next.slice(0, -1).every((value, index) => value === previous[index]);
  }
  if (next.length <= previous.length) {
    const depth = next.length - 1;
    for (let index = 0; index < depth; index += 1) if (next[index] !== previous[index]) return false;
    return next[depth] === previous[depth] + 1;
  }
  return false;
}

const MARKER = /(\d{1,3}(?:\.\d{1,3}){0,3})\.?(?:\s*[)\-–—]\s*|\s+)(?=[^\s\d.)\-–—])/g;

function numberedTopics(content: string): string[] | null {
  const text = content.replace(/\s+/g, " ").trim();
  const accepted: { index: number; end: number; path: NumberPath; label: string }[] = [];
  let previous: NumberPath | null = null;
  MARKER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER.exec(text))) {
    const start = match.index;
    const before = text.slice(Math.max(0, start - 14), start);
    const charBefore = start > 0 ? text.charAt(start - 1) : "";
    if (charBefore && !/\s/.test(charBefore)) continue;
    if (REFERENCE_BEFORE.test(before)) continue;
    const path = parsePath(match[1]);
    if (!isSuccessor(previous, path)) continue;
    accepted.push({ index: start, end: start + match[0].length, path, label: match[1] });
    previous = path;
  }
  if (accepted.length < 2) return null;
  const topics: string[] = [];
  accepted.forEach((entry, position) => {
    const next = accepted[position + 1];
    const body = cleanTopic(text.slice(entry.end, next ? next.index : undefined));
    if (!body) return;
    topics.push(entry.path.length > 1 ? `${entry.label} ${body}` : body);
  });
  return topics;
}

function lineTopics(content: string): string[] {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 1) {
    const single = lines[0];
    if (single.includes(";")) return single.split(";").map(cleanTopic).filter(Boolean);
    const sentences = single.split(/\.\s+(?=\p{Lu})/u).map(cleanTopic).filter(Boolean);
    if (sentences.length > 1) return sentences;
    return [cleanTopic(single)].filter(Boolean);
  }
  const topics: string[] = [];
  for (const line of lines) {
    const clean = cleanTopic(line.replace(/^\d{1,3}(?:\.\d{1,3})*[.)\-–]?\s+/, (prefix) => (/\d\.\d/.test(prefix) ? prefix : "")));
    if (clean) topics.push(clean);
  }
  return topics;
}

function topicsFrom(content: string): string[] {
  const numbered = numberedTopics(content);
  const list = numbered ?? lineTopics(content);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const topic of list) {
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(topic);
  }
  return unique;
}

const INLINE_HEADER = /^([^:\n]{3,90}?):\s*(.+)$/;

function isStandaloneHeader(line: string): boolean {
  if (line.length > 90 || /^[\d\-–—•·▪*]/.test(line)) return false;
  if (/[.;]$/.test(line)) return false;
  if (/:$/.test(line)) return line.length > 3;
  return mostlyUpper(line) && line.split(/\s+/).length <= 12;
}

function isInlineHeader(name: string, rest: string): boolean {
  if (/^\s*[\d\-–—•·▪*]/.test(name)) return false;
  const words = name.trim().split(/\s+/).length;
  if (words > 10) return false;
  const restStartsNumbered = /^\s*\d{1,2}(?:[.)\-–\s])/.test(rest);
  return restStartsNumbered || (mostlyUpper(name) && words <= 8);
}

const RUN_IN_HEADER = /([.;!?)])\s+(?=\p{Lu}[\p{Lu}\p{M} ,'’()/\-–]{2,90}:)/gu;

export function parseSyllabus(input: string): ParsedSubject[] {
  const text = input.replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/\xa0/g, " ").replace(RUN_IN_HEADER, "$1\n");
  const lines = text.split("\n").map((line) => line.replace(/\s+/g, " ").trim());
  const subjects: { name: string; content: string[] }[] = [];
  let current: { name: string; content: string[] } | null = null;

  for (const line of lines) {
    if (!line) {
      continue;
    }
    const inline = INLINE_HEADER.exec(line);
    if (inline && isInlineHeader(inline[1], inline[2])) {
      current = { name: inline[1], content: [inline[2]] };
      subjects.push(current);
      continue;
    }
    if (isStandaloneHeader(line)) {
      current = { name: line, content: [] };
      subjects.push(current);
      continue;
    }
    if (!current) {
      current = { name: "", content: [] };
      subjects.push(current);
    }
    current.content.push(line);
  }

  const parsed = subjects
    .map((entry) => ({ name: cleanSubjectName(entry.name), topics: topicsFrom(entry.content.join("\n")) }))
    .filter((entry) => entry.name || entry.topics.length);

  const withTopics = parsed.filter((entry) => entry.topics.length);
  const result = withTopics.length ? withTopics : parsed;
  const merged: ParsedSubject[] = [];
  for (const entry of result) {
    const existing = merged.find((candidate) => candidate.name && candidate.name.toLowerCase() === entry.name.toLowerCase());
    if (existing) {
      for (const topic of entry.topics) if (!existing.topics.includes(topic)) existing.topics.push(topic);
    } else {
      merged.push({ name: entry.name, topics: [...entry.topics] });
    }
  }
  return merged;
}

function detectDelimiter(sample: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = sample.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string): string[][] {
  const text = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).replace(/\r\n?/g, "\n");
  const firstLine = text.split("\n").find((line) => line.trim()) ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((entry) => entry.map((value) => value.trim())).filter((entry) => entry.some(Boolean));
}

const SUBJECT_HEADERS = /^(mat[ée]ria|disciplina|subject|course|asignatura|mati[èe]re|materia|fach|предмет|科目|学科|المادة)s?$/i;
const TOPIC_HEADERS = /^(t[óo]pico|assunto|conte[úu]do|topic|tema|sujet|th[èe]me|argomento|thema|тема|トピック|主题|الموضوع)s?$/i;

export function subjectsFromCsv(input: string): ParsedSubject[] {
  const rows = parseCsv(input);
  if (!rows.length) return [];
  let subjectColumn = 0;
  let topicColumn = 1;
  const header = rows[0];
  const subjectIndex = header.findIndex((value) => SUBJECT_HEADERS.test(value));
  const topicIndex = header.findIndex((value) => TOPIC_HEADERS.test(value));
  const hasHeader = subjectIndex >= 0 || topicIndex >= 0;
  if (subjectIndex >= 0) subjectColumn = subjectIndex;
  if (topicIndex >= 0) topicColumn = topicIndex;
  const body = hasHeader ? rows.slice(1) : rows;
  const map = new Map<string, ParsedSubject>();
  let lastSubject = "";
  for (const row of body) {
    const rawSubject = (row[subjectColumn] ?? "").trim() || lastSubject;
    if (!rawSubject) continue;
    lastSubject = rawSubject;
    const name = cleanSubjectName(rawSubject);
    const key = name.toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = { name, topics: [] };
      map.set(key, entry);
    }
    const topic = cleanTopic(row[topicColumn] ?? "");
    if (topic && !entry.topics.includes(topic)) entry.topics.push(topic);
  }
  return [...map.values()];
}

export function topicListFromText(input: string): string[] {
  const parsed = parseSyllabus(input);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const subject of parsed) {
    const entries = subject.topics.length ? subject.topics : subject.name ? [subject.name] : [];
    for (const entry of entries) {
      const key = entry.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

const LEADING_MARK = /^\s*(?:[-–—•*·▪◦]+|\(?\d+(?:[.\-]\d+)*[.)\-:]?|[a-z][.)])\s+/i;

export function linesFromText(input: string, limit = MAX_NAME_LENGTH): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.replace(LEADING_MARK, "").replace(/\s+/g, " ").trim().slice(0, limit);
    const key = draftKey(line);
    if (!line || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export function draftKey(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function mergeDrafts(current: SubjectDraft[], incoming: SubjectDraft[]): { drafts: SubjectDraft[]; subjects: number; topics: number } {
  const drafts = current.map((draft) => ({ ...draft, topics: [...draft.topics] }));
  const used = drafts.map((draft) => draft.color).filter((color): color is string => Boolean(color));
  let subjects = 0;
  let topics = 0;
  for (const draft of incoming) {
    const name = draft.name.replace(/\s+/g, " ").trim();
    const fresh = draft.topics.filter((topic) => topic.name.trim());
    const existing = name ? drafts.find((item) => draftKey(item.name) === draftKey(name)) : undefined;
    if (existing) {
      const known = new Set(existing.topics.map((topic) => draftKey(topic.name)));
      for (const topic of fresh) {
        const key = draftKey(topic.name);
        if (known.has(key)) continue;
        known.add(key);
        existing.topics.push(topic);
        topics += 1;
      }
      if (!existing.notebookId && draft.notebookId) existing.notebookId = draft.notebookId;
      continue;
    }
    if (!name && !fresh.length) continue;
    const color = draft.color ?? nextSubjectColor(used);
    used.push(color);
    drafts.push({ ...draft, name, color, topics: fresh });
    subjects += 1;
    topics += fresh.length;
  }
  return { drafts, subjects, topics };
}
