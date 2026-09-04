import type { CSSProperties } from "react";

export type CoverPreset = {
  id: string;
  label: string;
  className?: string;
  style?: CSSProperties;
};

/** Stored as `coverUrl` so existing teal/dusk/forest/sand/ink ids keep working. */
export const COVER_PRESETS: CoverPreset[] = [
  {
    id: "cover:teal",
    label: "Atlântico",
    className: "bg-gradient-to-r from-[#0F2C4C] via-[#0E7490] to-[#67E8F9]",
  },
  {
    id: "cover:dusk",
    label: "Entardecer",
    className: "bg-gradient-to-r from-[#1E1B4B] via-[#6D28D9] to-[#FB7185]",
  },
  {
    id: "cover:forest",
    label: "Floresta",
    className: "bg-gradient-to-r from-[#064E3B] via-[#059669] to-[#BEF264]",
  },
  {
    id: "cover:sand",
    label: "Areia",
    className: "bg-gradient-to-r from-[#FDE68A] via-[#FDBA74] to-[#FB7185]",
  },
  {
    id: "cover:ink",
    label: "Noite",
    className: "bg-gradient-to-r from-[#07111C] via-[#155E75] to-[#22D3EE]",
  },
  {
    id: "cover:aurora",
    label: "Aurora",
    className: "bg-gradient-to-br from-[#022c22] via-[#0f766e] to-[#a7f3d0]",
  },
  {
    id: "cover:nebula",
    label: "Nébula",
    className: "bg-gradient-to-tr from-[#1e1b4b] via-[#7c3aed] to-[#fb7185]",
  },
  {
    id: "cover:glacier",
    label: "Geleira",
    className: "bg-gradient-to-r from-[#0c4a6e] via-[#38bdf8] to-[#e0f2fe]",
  },
  {
    id: "cover:ember",
    label: "Brasa",
    className: "bg-gradient-to-r from-[#431407] via-[#ea580c] to-[#fde68a]",
  },
  {
    id: "cover:matcha",
    label: "Matchá",
    className: "bg-gradient-to-bl from-[#14532d] via-[#65a30d] to-[#fef9c3]",
  },
  {
    id: "cover:terracotta",
    label: "Terracota",
    className: "bg-gradient-to-r from-[#7c2d12] via-[#c2410c] to-[#fdba74]",
  },
  {
    id: "cover:rose",
    label: "Quartzo",
    className: "bg-gradient-to-r from-[#831843] via-[#fb7185] to-[#ffe4e6]",
  },
  {
    id: "cover:cobalt",
    label: "Cobalto",
    className: "bg-gradient-to-br from-[#172554] via-[#2563eb] to-[#67e8f9]",
  },
  {
    id: "cover:vineyard",
    label: "Vinhedo",
    className: "bg-gradient-to-r from-[#3b0764] via-[#7e22ce] to-[#f5d0fe]",
  },
  {
    id: "cover:cerrado",
    label: "Cerrado",
    className: "bg-gradient-to-r from-[#365314] via-[#ca8a04] to-[#fef08a]",
  },
  {
    id: "cover:ipe",
    label: "Ipê",
    className: "bg-gradient-to-br from-[#422006] via-[#f59e0b] to-[#fef9c3]",
  },
  {
    id: "cover:bandeira",
    label: "Verde e ouro",
    className: "bg-gradient-to-r from-[#14532d] via-[#15803d] to-[#facc15]",
  },
  {
    id: "cover:parchment",
    label: "Pergaminho",
    className: "bg-gradient-to-b from-[#fff7ed] via-[#fed7aa] to-[#d6d3d1]",
  },
  {
    id: "cover:library",
    label: "Biblioteca",
    className: "bg-gradient-to-r from-[#1c1917] via-[#7c2d12] to-[#d6d3d1]",
  },
  {
    id: "cover:paper",
    label: "Listra suave",
    className: "bg-[#eef2ff]",
    style: {
      backgroundImage:
        "repeating-linear-gradient(135deg, rgba(79,70,229,0.16) 0 14px, transparent 14px 28px)",
    },
  },
  {
    id: "cover:grid",
    label: "Caderno",
    className: "bg-[#0f172a]",
    style: {
      backgroundImage:
        "linear-gradient(rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.22) 1px, transparent 1px)",
      backgroundSize: "28px 28px",
    },
  },
  {
    id: "cover:dots",
    label: "Pontos",
    className: "bg-[#0b1220]",
    style: {
      backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.28) 1px, transparent 0)",
      backgroundSize: "18px 18px",
    },
  },
  {
    id: "cover:waves",
    label: "Ondas",
    className: "bg-[#082f49]",
    style: {
      backgroundImage:
        "radial-gradient(120% 80% at 0% 100%, rgba(56,189,248,0.55), transparent), radial-gradient(90% 70% at 100% 0%, rgba(45,212,191,0.45), transparent)",
    },
  },
  {
    id: "cover:constellation",
    label: "Constelação",
    className: "bg-[#020617]",
    style: {
      backgroundImage:
        "radial-gradient(1.5px 1.5px at 12% 28%, #fff 50%, transparent), radial-gradient(1.5px 1.5px at 38% 62%, #e0f2fe 50%, transparent), radial-gradient(1.2px 1.2px at 72% 18%, #fff 50%, transparent), radial-gradient(1.8px 1.8px at 86% 74%, #a5b4fc 50%, transparent), radial-gradient(80% 60% at 50% 120%, rgba(79,70,229,0.45), transparent)",
    },
  },
  {
    id: "cover:mosaic",
    label: "Mosaico",
    className: "bg-[#111827]",
    style: {
      backgroundImage:
        "linear-gradient(60deg, #0ea5e9 25%, transparent 25%), linear-gradient(120deg, #8b5cf6 25%, transparent 25%), linear-gradient(180deg, #f43f5e 12%, transparent 12%)",
      backgroundSize: "48px 48px",
      backgroundBlendMode: "screen",
    },
  },
];

export function coverPresetById(id: string | null | undefined) {
  if (!id) return undefined;
  return COVER_PRESETS.find((item) => item.id === id);
}
