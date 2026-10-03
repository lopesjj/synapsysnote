export interface RemoteMotto {
  id: string;
  text: string;
  author: string;
}

const THEME =
  /\b(persever\w*|persist\w*|resilien\w*|grit|tenac\w*|endur\w*|setback\w*|discipline\w*|willpower|overcom\w*|goal\w*|success\w*|succeed\w*|achiev\w*|ambition\w*|determin\w*|courage\w*|don't quit|do not quit|never give up|never quit|keep going|keep moving|don't stop|do not stop|keep on|showing up|not quit|bounce back|get back up|try again|hard work|work hard|stay the course|inner strength|commit\w*|victory|purpose\w*|patience|steadfast)\b/i;

export function canonMotto(value: string): string {
  return value
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#039;|&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&ldquo;|&#8220;|&rdquo;|&#8221;/g, '"')
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/<[^>]*>/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteFitsTheme(text: string): boolean {
  const clean = canonMotto(text);
  if (clean.length < 24 || clean.length > 220) return false;
  if (/https?:|www\./i.test(clean)) return false;
  return THEME.test(clean);
}

export function pickUnseen(pool: RemoteMotto[], seen: Iterable<string>): RemoteMotto | null {
  const skip = seen instanceof Set ? seen : new Set(seen);
  for (const quote of pool) {
    if (!quote.id || skip.has(quote.id)) continue;
    if (!quoteFitsTheme(quote.text)) continue;
    return quote;
  }
  return null;
}

const MARKS: Record<string, [string, string]> = {
  fr: ["«\u202f", "\u202f»"],
  es: ["«", "»"],
  ru: ["«", "»"],
  ar: ["«", "»"],
  de: ["„", "“"],
  ja: ["「", "」"],
  zh: ["“", "”"],
};

export function mottoMarks(language: string): [string, string] {
  return MARKS[language] ?? ["“", "”"];
}
