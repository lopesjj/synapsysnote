export const TEXT_COLORS = [
  { label: "Padrão", value: null },
  { label: "Cinza", value: "#9CA3AF" },
  { label: "Grafite", value: "#4B5563" },
  { label: "Marrom", value: "#92400E" },
  { label: "Laranja", value: "#EA580C" },
  { label: "Âmbar", value: "#D97706" },
  { label: "Amarelo", value: "#CA8A04" },
  { label: "Lima", value: "#65A30D" },
  { label: "Verde", value: "#059669" },
  { label: "Teal", value: "#0D9488" },
  { label: "Ciano", value: "#0891B2" },
  { label: "Azul", value: "#2563EB" },
  { label: "Índigo", value: "#4F46E5" },
  { label: "Violeta", value: "#7C3AED" },
  { label: "Roxo", value: "#9333EA" },
  { label: "Magenta", value: "#C026D3" },
  { label: "Rosa", value: "#DB2777" },
  { label: "Vermelho", value: "#DC2626" },
] as const;

export const HIGHLIGHT_COLORS = [
  { label: "Sem marca", value: null, varName: undefined, borderVarName: undefined },
  { label: "Cinza", value: "#E5E7EB", varName: "--hl-gray", borderVarName: "--hl-gray-border" },
  { label: "Marrom", value: "#E7D5C5", varName: "--hl-brown", borderVarName: "--hl-brown-border" },
  { label: "Laranja", value: "#FED7AA", varName: "--hl-orange", borderVarName: "--hl-orange-border" },
  { label: "Amarelo", value: "#FDE68A", varName: "--hl-yellow", borderVarName: "--hl-yellow-border" },
  { label: "Lima", value: "#D9F99D", varName: "--hl-lime", borderVarName: "--hl-lime-border" },
  { label: "Verde", value: "#BBF7D0", varName: "--hl-green", borderVarName: "--hl-green-border" },
  { label: "Teal", value: "#99F6E4", varName: "--hl-teal", borderVarName: "--hl-teal-border" },
  { label: "Ciano", value: "#A5F3FC", varName: "--hl-cyan", borderVarName: "--hl-cyan-border" },
  { label: "Azul", value: "#BFDBFE", varName: "--hl-blue", borderVarName: "--hl-blue-border" },
  { label: "Índigo", value: "#C7D2FE", varName: "--hl-indigo", borderVarName: "--hl-indigo-border" },
  { label: "Violeta", value: "#DDD6FE", varName: "--hl-violet", borderVarName: "--hl-violet-border" },
  { label: "Roxo", value: "#E9D5FF", varName: "--hl-purple", borderVarName: "--hl-purple-border" },
  { label: "Magenta", value: "#F5D0FE", varName: "--hl-magenta", borderVarName: "--hl-magenta-border" },
  { label: "Rosa", value: "#FECDD3", varName: "--hl-pink", borderVarName: "--hl-pink-border" },
  { label: "Vermelho", value: "#FECACA", varName: "--hl-red", borderVarName: "--hl-red-border" },
] as const;

export type PaletteColor = {
  label: string;
  value: string | null;
  varName?: string;
  borderVarName?: string;
};
