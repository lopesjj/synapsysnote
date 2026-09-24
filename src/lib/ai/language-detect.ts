import type { SupportedLanguage } from "@/types/models";

const LATIN_MARKERS: Record<"pt" | "es" | "fr" | "it" | "de" | "en", readonly string[]> = {
  pt: [
    "não", "é", "são", "você", "vocês", "isso", "isto", "também", "então", "uma", "com", "muito",
    "muita", "ele", "ela", "eles", "elas", "nós", "tem", "têm", "foi", "fazer", "do", "dos", "na",
    "nas", "ao", "aos", "pela", "já", "só", "até", "ainda", "depois", "tá", "né", "coisa", "bem",
    "sim", "agora", "esse", "essa", "aquele", "aquela", "vou", "ter", "pode", "onde", "mesmo",
    "dele", "dela", "num", "numa",
  ],
  es: [
    "el", "los", "las", "y", "es", "pero", "muy", "también", "esto", "eso", "cuando", "donde",
    "qué", "hay", "más", "mucho", "muchos", "ahora", "después", "entonces", "ya", "sí", "así",
    "puede", "hacer", "tiene", "tienen", "fue", "yo", "usted", "ustedes", "nosotros", "ellos",
    "ella", "él", "sus", "aquí", "allí", "esa", "ese", "mismo", "cómo", "hola",
  ],
  fr: [
    "est", "et", "je", "vous", "nous", "une", "des", "du", "au", "aux", "ce", "cette", "pas",
    "pour", "dans", "sur", "avec", "très", "ça", "elle", "ils", "sont", "fait", "être", "avoir",
    "tout", "leur", "aussi", "comme", "oui", "donc", "alors", "j", "qu", "où",
  ],
  it: [
    "gli", "della", "delle", "degli", "che", "è", "sono", "anche", "perché", "questo", "questa",
    "quello", "quella", "molto", "però", "alla", "allo", "nella", "nel", "abbiamo", "fare",
    "essere", "stato", "poi", "adesso", "ancora", "tutto", "tutti", "ho", "hai", "io", "noi",
    "voi", "loro", "così", "dove", "quindi", "bene", "grazie", "sì",
  ],
  de: [
    "der", "die", "und", "ist", "nicht", "ich", "sie", "ein", "eine", "zu", "den", "dem", "mit",
    "auf", "für", "von", "sich", "auch", "wir", "wie", "aber", "noch", "nur", "oder", "wenn",
    "dann", "schon", "hier", "sehr", "dass", "war", "sind", "haben", "wird", "werden", "kann",
  ],
  en: [
    "the", "and", "is", "are", "you", "that", "this", "with", "have", "not", "for", "of", "to",
    "we", "they", "what", "there", "be", "can", "would", "just", "like", "but", "it", "if",
    "about", "your", "our", "which", "been",
  ],
};

const MARKER_SETS = Object.fromEntries(
  Object.entries(LATIN_MARKERS).map(([language, words]) => [language, new Set(words)])
) as Record<keyof typeof LATIN_MARKERS, Set<string>>;

function scriptLanguage(text: string): SupportedLanguage | null {
  let letters = 0;
  let cyrillic = 0;
  let arabic = 0;
  let kana = 0;
  let han = 0;
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue;
    letters += 1;
    if (/\p{Script=Cyrillic}/u.test(char)) cyrillic += 1;
    else if (/\p{Script=Arabic}/u.test(char)) arabic += 1;
    else if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char)) kana += 1;
    else if (/\p{Script=Han}/u.test(char)) han += 1;
  }
  if (!letters) return null;
  if (cyrillic / letters > 0.3) return "ru";
  if (arabic / letters > 0.3) return "ar";
  if ((kana + han) / letters > 0.3) return kana / letters > 0.05 ? "ja" : "zh";
  return null;
}

export function detectLanguage(text: string): SupportedLanguage | null {
  const sample = text.slice(0, 6000);
  const byScript = scriptLanguage(sample);
  if (byScript) return byScript;

  const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 8) return null;
  const scores = (Object.keys(MARKER_SETS) as (keyof typeof MARKER_SETS)[]).map((language) => ({
    language,
    score: words.reduce((total, word) => total + (MARKER_SETS[language].has(word) ? 1 : 0), 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (best.score < 3 || best.score < second.score * 1.5) return null;
  return best.language;
}
