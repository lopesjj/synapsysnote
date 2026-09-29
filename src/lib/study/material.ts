import type { StudyReview, StudySession, StudySubject } from "@/types/study";

export interface MaterialTarget {
  reviewId?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
}

export interface MaterialSources {
  reviews: readonly StudyReview[];
  sessions: readonly StudySession[];
  subjects: readonly StudySubject[];
}

export function materialNoteId(
  target: MaterialTarget,
  sources: MaterialSources,
  exists: (pageId: string) => boolean
): string | null {
  const usable = (pageId: string | null | undefined): pageId is string => Boolean(pageId && exists(pageId));
  const review = target.reviewId ? sources.reviews.find((entry) => entry.id === target.reviewId) : undefined;
  const subjectId = target.subjectId ?? review?.subjectId ?? null;
  const topicId = target.topicId ?? review?.topicId ?? null;

  if (review) {
    const origin = sources.sessions.find((session) => session.id === review.sessionId)?.pageId;
    if (usable(origin)) return origin;
  }
  if (!subjectId) return null;
  if (topicId) {
    const topicNote = sources.subjects.find((subject) => subject.id === subjectId)?.topics.find((topic) => topic.id === topicId)?.pageId;
    if (usable(topicNote)) return topicNote;
  }
  let latest: StudySession | null = null;
  for (const session of sources.sessions) {
    if (session.subjectId !== subjectId || session.topicId !== topicId || !usable(session.pageId)) continue;
    if (!latest || session.day > latest.day || (session.day === latest.day && session.createdAt > latest.createdAt)) latest = session;
  }
  return latest?.pageId ?? null;
}

export interface NoteEntry {
  id: string;
  title: string;
  trail: string[];
  updatedAt: number;
}

interface NotePageLike {
  id: string;
  title: string;
  notebookId: string | null;
  parentPageId: string | null;
  updatedAt: number;
}

interface NotebookLike {
  id: string;
  name: string;
  parentId?: string | null;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildNoteDirectory(
  pages: readonly NotePageLike[],
  notebooks: readonly NotebookLike[],
  untitled: string
): NoteEntry[] {
  const notebookById = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const pageById = new Map(pages.map((page) => [page.id, page]));
  return pages.map((page) => {
    const notebookTrail: string[] = [];
    const seenNotebooks = new Set<string>();
    let notebook = page.notebookId ? notebookById.get(page.notebookId) : undefined;
    while (notebook && !seenNotebooks.has(notebook.id)) {
      seenNotebooks.add(notebook.id);
      notebookTrail.unshift(notebook.name || untitled);
      notebook = notebook.parentId ? notebookById.get(notebook.parentId) : undefined;
    }
    const parentTrail: string[] = [];
    const seenPages = new Set<string>([page.id]);
    let parent = page.parentPageId ? pageById.get(page.parentPageId) : undefined;
    while (parent && !seenPages.has(parent.id)) {
      seenPages.add(parent.id);
      parentTrail.unshift(parent.title || untitled);
      parent = parent.parentPageId ? pageById.get(parent.parentPageId) : undefined;
    }
    return { id: page.id, title: page.title || untitled, trail: [...notebookTrail, ...parentTrail], updatedAt: page.updatedAt };
  });
}

export function searchNotes(entries: readonly NoteEntry[], query: string, limit = 8): NoteEntry[] {
  const tokens = fold(query).split(" ").filter(Boolean);
  const recent = (a: NoteEntry, b: NoteEntry) => b.updatedAt - a.updatedAt;
  if (!tokens.length) return [...entries].sort(recent).slice(0, limit);
  const whole = fold(query);
  const scored: { entry: NoteEntry; score: number }[] = [];
  for (const entry of entries) {
    const title = fold(entry.title);
    const trail = fold(entry.trail.join(" "));
    let score = 0;
    let matched = true;
    for (const token of tokens) {
      if (title.startsWith(token) || title.includes(` ${token}`)) score += 4;
      else if (title.includes(token)) score += 2;
      else if (trail.includes(token)) score += 1;
      else {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (title === whole) score += 10;
    else if (title.startsWith(whole)) score += 5;
    scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || recent(a.entry, b.entry))
    .slice(0, limit)
    .map((item) => item.entry);
}
