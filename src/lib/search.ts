import type { Notebook, Page, SearchHit } from "@/types/models";


const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "um", "uma",
  "para", "com", "que", "no", "na", "the", "of", "to", "and", "in",
]);

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9@#_]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function snippetAround(text: string, tokens: string[], length = 150): string {
  if (!text) return "";
  const haystack = text.replace(/\s+/g, " ");
  const lower = haystack
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const index = tokens.map((token) => lower.indexOf(token)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (index === undefined) return haystack.slice(0, length);
  const start = Math.max(0, index - 40);
  return `${start > 0 ? "…" : ""}${haystack.slice(start, start + length)}${
    haystack.length > start + length ? "…" : ""
  }`;
}

interface ScoredField {
  field: SearchHit["matchedIn"][number];
  text: string;
  weight: number;
}

export function searchWorkspace(
  query: string,
  pages: Page[],
  notebooks: Notebook[] = [],
  limit = 16
): SearchHit[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const hits: SearchHit[] = [];
  const now = Date.now();

  for (const notebook of notebooks) {
    const fields: { field: "title" | "body"; text: string; weight: number }[] = [
      { field: "title", text: notebook.name, weight: 7 },
      { field: "body", text: notebook.description ?? "", weight: 2 },
    ];

    let score = 0;
    const matchedIn = new Set<SearchHit["matchedIn"][number]>();

    for (const { field, text, weight } of fields) {
      if (!text) continue;
      const normalized = text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      for (const token of tokens) {
        const occurrences = normalized.split(token).length - 1;
        if (occurrences > 0) {
          score += weight * (1 + Math.log(occurrences));
          matchedIn.add(field);
        }
      }
      if (field === "title" && normalized.startsWith(tokens[0])) score += 5;
    }

    if (!score) continue;

    hits.push({
      id: notebook.id,
      kind: "notebook",
      title: notebook.name,
      snippet: notebook.description ? snippetAround(notebook.description, tokens) : "Caderno",
      score: score + 2,
      matchedIn: [...matchedIn],
      icon: notebook.emoji || undefined,
    });
  }

  for (const page of pages) {
    if (page.deletedAt) continue;

    const fields: ScoredField[] = [
      { field: "title", text: page.title, weight: 6 },
      { field: "tag", text: page.tags.join(" "), weight: 3 },
      { field: "body", text: page.plainText, weight: 1.5 },
    ];

    let score = 0;
    const matchedIn = new Set<SearchHit["matchedIn"][number]>();

    for (const { field, text, weight } of fields) {
      if (!text) continue;
      const normalized = text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      for (const token of tokens) {
        const occurrences = normalized.split(token).length - 1;
        if (occurrences > 0) {
          score += weight * (1 + Math.log(occurrences));
          matchedIn.add(field);
        }
      }
      if (field === "title" && normalized.startsWith(tokens[0])) score += 4;
    }

    if (!score) continue;

    const ageDays = (now - page.updatedAt) / 86_400_000;
    score += Math.max(0, 2 - ageDays / 14);

    hits.push({
      id: page.id,
      kind: "page",
      title: page.title,
      snippet: snippetAround(page.plainText, tokens),
      score,
      matchedIn: [...matchedIn],
      notebookId: page.notebookId,
      icon: page.icon || undefined,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
