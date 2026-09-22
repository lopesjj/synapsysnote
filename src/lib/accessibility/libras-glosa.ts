export interface LibrasToken {
  id: string;
  originalWord: string;
  glosa: string;
  isConceptSign: boolean;
  characters: string[];
  durationMs: number;
}

const STOP_WORDS = new Set([
  "o", "a", "os", "as", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos",
  "em", "na", "no", "nas", "nos",
  "para", "pra", "pro", "pras", "pros",
  "com", "por", "pelo", "pela", "pelos", "pelas",
  "que", "e", "ou",
  "de", "se",
]);

const VERB_LEMMAS: Record<string, string> = {
  sou: "",
  e: "",
  era: "",
  foi: "",
  ser: "",
  estou: "",
  esta: "",
  estao: "",
  estava: "",
  estar: "",
  tenho: "TER",
  tem: "TER",
  temos: "TER",
  tinha: "TER",
  faco: "FAZER",
  faz: "FAZER",
  fazendo: "FAZER",
  fez: "FAZER",
  fara: "FAZER",
  escrevo: "ESCREVER",
  escreve: "ESCREVER",
  escrevendo: "ESCREVER",
  escreveu: "ESCREVER",
  leio: "LER",
  le: "LER",
  lendo: "LER",
  leu: "LER",
  ouco: "OUVIR",
  ouve: "OUVIR",
  ouvindo: "OUVIR",
  ouviu: "OUVIR",
  anoto: "ANOTAR",
  anota: "ANOTAR",
  anotando: "ANOTAR",
  anotou: "ANOTAR",
  gravo: "GRAVAR",
  grava: "GRAVAR",
  gravando: "GRAVAR",
  gravou: "GRAVAR",
  quero: "QUERER",
  quer: "QUERER",
  queria: "QUERER",
  preciso: "PRECISAR",
  precisa: "PRECISAR",
  precisando: "PRECISAR",
  gosto: "GOSTAR",
  gosta: "GOSTAR",
  gostei: "GOSTAR",
  ajudo: "AJUDAR",
  ajuda: "AJUDAR",
  ajudando: "AJUDAR",
  vejo: "VER",
  ve: "VER",
  vendo: "VER",
  viu: "VER",
  falo: "FALAR",
  fala: "FALAR",
  falando: "FALAR",
  falou: "FALAR",
};

const CONCEPT_MAP: Record<string, string> = {
  audio: "AUDIO",
  som: "AUDIO",
  gravacao: "AUDIO",
  voz: "AUDIO",
  video: "VIDEO",
  filme: "VIDEO",
  nota: "NOTA",
  notas: "NOTA",
  anotacao: "NOTA",
  anotacoes: "NOTA",
  bom: "BOM",
  boa: "BOM",
  otimo: "BOM",
  otima: "BOM",
  obrigado: "OBRIGADO",
  obrigada: "OBRIGADO",
  valeu: "OBRIGADO",
  sim: "SIM",
  claro: "SIM",
  positivo: "SIM",
  nao: "NAO",
  nunca: "NAO",
  ideia: "IDEIA",
  pensamento: "IDEIA",
  insight: "IDEIA",
};

function normalizeForComparison(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]/g, "");
}

export function convertTextToLibrasGlosa(text: string): LibrasToken[] {
  if (!text || !text.trim()) return [];

  const rawWords = text
    .replace(/[\r\n]+/g, " ")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'«»]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const tokens: LibrasToken[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const raw = rawWords[i];
    const normalized = normalizeForComparison(raw);
    if (!normalized) continue;

    if (STOP_WORDS.has(normalized)) {
      continue;
    }

    let glosaWord: string;
    let isConcept = false;

    if (CONCEPT_MAP[normalized]) {
      glosaWord = CONCEPT_MAP[normalized];
      isConcept = true;
    } else if (VERB_LEMMAS[normalized] !== undefined) {
      const lemma = VERB_LEMMAS[normalized];
      if (!lemma) continue;
      glosaWord = lemma;
      if (CONCEPT_MAP[lemma.toLowerCase()]) {
        isConcept = true;
      }
    } else {
      glosaWord = raw.toUpperCase();
    }

    const chars = isConcept
      ? [glosaWord]
      : Array.from(glosaWord).filter((c) => /^[A-Z0-9Ç]$/i.test(c));

    if (chars.length === 0) continue;

    const durationMs = isConcept ? 1200 : Math.max(800, chars.length * 360);

    tokens.push({
      id: `${normalized}_${i}`,
      originalWord: raw,
      glosa: glosaWord,
      isConceptSign: isConcept,
      characters: chars,
      durationMs,
    });
  }

  return tokens;
}
