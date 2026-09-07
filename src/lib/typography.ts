
export type FontCategory = "sans" | "serif" | "mono";

export interface EditorFont {
  id: string;
  name: string;
  category: FontCategory;
  stack: string;
  note: string;
}

export const EDITOR_FONTS: EditorFont[] = [
  {
    id: "geist",
    name: "Geist Sans",
    category: "sans",
    stack: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    note: "Neutra e compacta. Padrão da interface.",
  },
  {
    id: "inter",
    name: "Inter",
    category: "sans",
    stack: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    note: "Altura de x generosa - ótima legibilidade em telas.",
  },
  {
    id: "ibm-plex-sans",
    name: "IBM Plex Sans",
    category: "sans",
    stack: "var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif",
    note: "Traço técnico com terminações levemente humanistas.",
  },
  {
    id: "work-sans",
    name: "Work Sans",
    category: "sans",
    stack: "var(--font-work-sans), ui-sans-serif, system-ui, sans-serif",
    note: "Geométrica e arejada, boa para títulos longos.",
  },
  {
    id: "nunito-sans",
    name: "Nunito Sans",
    category: "sans",
    stack: "var(--font-nunito-sans), ui-sans-serif, system-ui, sans-serif",
    note: "Cantos arredondados, tom informal e amigável.",
  },
  {
    id: "literata",
    name: "Literata",
    category: "serif",
    stack: "var(--font-literata), ui-serif, Georgia, serif",
    note: "Desenhada para leitura longa em tela. Serifa robusta.",
  },
  {
    id: "source-serif",
    name: "Source Serif 4",
    category: "serif",
    stack: "var(--font-source-serif), ui-serif, Georgia, serif",
    note: "Contraste moderado - o clássico editorial da Adobe.",
  },
  {
    id: "newsreader",
    name: "Newsreader",
    category: "serif",
    stack: "var(--font-newsreader), ui-serif, Georgia, serif",
    note: "Ar de revista, itálicos expressivos.",
  },
  {
    id: "lora",
    name: "Lora",
    category: "serif",
    stack: "var(--font-lora), ui-serif, Georgia, serif",
    note: "Serifas em pincelada, calorosa para ensaios.",
  },
  {
    id: "crimson-pro",
    name: "Crimson Pro",
    category: "serif",
    stack: "var(--font-crimson-pro), ui-serif, Georgia, serif",
    note: "Inspirada em tipos do velho mundo. Elegante e econômica.",
  },
  {
    id: "spectral",
    name: "Spectral",
    category: "serif",
    stack: "var(--font-spectral), ui-serif, Georgia, serif",
    note: "Serifa fina de alto contraste, muito editorial.",
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    category: "mono",
    stack: "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace",
    note: "Monoespaçada com ligaduras. Padrão dos blocos de código.",
  },
  {
    id: "ibm-plex-mono",
    name: "IBM Plex Mono",
    category: "mono",
    stack: "var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, monospace",
    note: "Monoespaçada com personalidade - escrita tipo máquina.",
  },
];

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: "Sem serifa",
  serif: "Com serifa",
  mono: "Monoespaçada",
};

const FALLBACK = EDITOR_FONTS[0];

export function fontById(id: string | undefined): EditorFont {
  return EDITOR_FONTS.find((font) => font.id === id) ?? FALLBACK;
}

export function fontsByCategory(): { category: FontCategory; label: string; fonts: EditorFont[] }[] {
  return (["sans", "serif", "mono"] as FontCategory[]).map((category) => ({
    category,
    label: FONT_CATEGORY_LABELS[category],
    fonts: EDITOR_FONTS.filter((font) => font.category === category),
  }));
}

export const EDITOR_WIDTHS: Record<"narrow" | "normal" | "wide", string> = {
  narrow: "48rem",
  normal: "64rem",
  wide: "84rem",
};
