"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface LibrasSignDefinition {
  id: string;
  name: string;
  description: string;
  category: "letter" | "number" | "concept" | "rest";
  svgPaths: React.ReactNode;
}

const SkinDefs = () => (
  <defs>
    <linearGradient id="librasSkin" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stopColor="#FED7AA" />
      <stop offset="45%" stopColor="#FDBA74" />
      <stop offset="100%" stopColor="#EA580C" />
    </linearGradient>
    <linearGradient id="librasSkinLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#FFEDD5" />
      <stop offset="60%" stopColor="#FED7AA" />
      <stop offset="100%" stopColor="#FB923C" />
    </linearGradient>
    <linearGradient id="librasSkinDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#FB923C" />
      <stop offset="100%" stopColor="#C2410C" />
    </linearGradient>
    <linearGradient id="librasPalm" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#FFF7ED" />
      <stop offset="50%" stopColor="#FED7AA" />
      <stop offset="100%" stopColor="#FDBA74" />
    </linearGradient>
    <linearGradient id="librasNail" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#FFFFFF" />
      <stop offset="100%" stopColor="#FED7AA" />
    </linearGradient>
    <linearGradient id="librasMotion" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#38BDF8" />
      <stop offset="100%" stopColor="#0284C7" />
    </linearGradient>
    <filter id="librasGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#9A3412" floodOpacity="0.22" />
    </filter>
  </defs>
);

export const LIBRAS_DICTIONARY: Record<string, LibrasSignDefinition> = {
  REST: {
    id: "REST",
    name: "Repouso",
    description: "Mão em posição neutra e relaxada",
    category: "rest",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 C38 78 36 68 38 52 C40 38 48 34 54 34 C60 34 66 40 64 54 C62 68 62 78 60 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M44 48 C44 40 54 40 56 48"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <ellipse cx="50" cy="42" rx="3.5" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M44 64 C47 62 53 62 56 64"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  A: {
    id: "A",
    name: "A",
    description: "Mão em punho fechado com o polegar vertical apoiado lateralmente",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M42 88 L40 76 C32 76 28 68 28 54 C28 42 34 36 46 36 C54 36 62 40 64 50 C66 60 64 74 58 76 L58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M32 46 C38 43 54 43 60 47"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M32 55 C38 52 54 52 60 56"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M33 64 C38 61 53 61 58 65"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M62 46 C67 46 72 50 72 58 C72 68 67 76 60 76 C58 76 58 70 60 62 C61 54 61 46 62 46 Z"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="67" cy="51" rx="3.2" ry="4" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M62 62 C65 62 69 64 70 66"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  B: {
    id: "B",
    name: "B",
    description: "Quatro dedos estendidos e unidos para cima, polegar cruzado sobre a palma",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 66 C32 66 30 54 32 40 L33 22 C33 16 38 16 39 22 L40 50 L42 18 C42 12 47 12 48 18 L49 50 L51 19 C51 13 56 13 57 19 L58 52 L60 25 C60 19 65 19 66 25 L67 62 C67 74 61 80 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <line x1="40" y1="22" x2="40" y2="52" stroke="#9A3412" strokeWidth="1.5" />
        <line x1="49" y1="18" x2="49" y2="52" stroke="#9A3412" strokeWidth="1.5" />
        <line x1="58" y1="20" x2="58" y2="52" stroke="#9A3412" strokeWidth="1.5" />
        <ellipse cx="36" cy="20" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="45" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="54" cy="17" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="63" cy="23" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M34 32 H65 M35 42 H64"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M30 68 C34 62 44 60 52 58 C56 57 58 62 55 65 C48 70 38 72 32 72 Z"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="52" cy="61" rx="2.5" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
      </g>
    ),
  },

  C: {
    id: "C",
    name: "C",
    description: "Mão em formato curvo de arco imitando a letra C",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M44 88 L42 74 C34 68 30 56 32 44 C34 30 46 22 62 24 C68 25 72 28 72 34 C72 38 67 40 62 38 C52 34 44 38 42 46 C40 56 44 64 54 68 C62 71 68 68 70 72 C72 78 66 82 58 82 C50 82 46 80 44 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="68" cy="30" rx="3" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="66" cy="76" rx="3" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M46 36 C52 38 58 40 64 42"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M46 68 C52 66 58 64 64 62"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  Ç: {
    id: "Ç",
    name: "Ç",
    description: "Configuração da letra C com movimento vibrante descendente",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M44 82 L42 70 C34 64 30 52 32 40 C34 28 46 20 62 22 C68 23 72 26 72 32 C72 36 67 38 62 36 C52 32 44 36 42 44 C40 54 44 62 54 66 C62 69 68 66 70 70 C72 76 66 80 58 80 C50 80 46 76 44 82 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="68" cy="28" rx="3" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="66" cy="74" rx="3" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M46 86 C50 84 54 88 58 86 M48 92 C52 90 56 94 60 92"
          fill="none"
          stroke="url(#librasMotion)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  D: {
    id: "D",
    name: "D",
    description: "Indicador estendido para cima, demais dedos unidos ao polegar formando um círculo",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M42 88 L40 68 C34 66 30 58 32 48 C34 38 42 34 46 34 L46 18 C46 12 51 12 52 18 L53 50 C58 48 64 50 67 56 C70 64 66 72 58 74 L58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="49" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <circle cx="50" cy="58" r="7" fill="url(#librasPalm)" stroke="#7C2D12" strokeWidth="2" />
        <path
          d="M46 28 H52 M46 38 H52"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  E: {
    id: "E",
    name: "E",
    description: "Dedos curvados para dentro com pontas pousadas sobre o polegar recolhido",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 72 C32 70 28 60 30 46 C32 36 40 32 52 32 C64 32 70 38 70 48 C70 62 64 72 58 74 L58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M34 42 C38 46 40 54 40 58"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M42 40 C46 44 48 52 48 58"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M50 40 C54 44 56 52 56 58"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M58 42 C62 46 64 54 64 58"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <ellipse cx="40" cy="58" rx="2" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="0.8" />
        <ellipse cx="48" cy="58" rx="2" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="0.8" />
        <ellipse cx="56" cy="58" rx="2" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="0.8" />
        <ellipse cx="64" cy="58" rx="2" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="0.8" />
        <path
          d="M32 64 C38 62 60 62 66 64"
          fill="none"
          stroke="#7C2D12"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  F: {
    id: "F",
    name: "F",
    description: "Indicador dobrado para a frente com polegar apoiado pelo lado de fora",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C34 68 32 60 34 52 L36 50 L44 22 C44 16 49 16 50 22 L51 48 L53 20 C53 14 58 14 59 20 L60 48 L62 24 C62 18 67 18 68 24 L69 66 C69 76 60 82 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="47" cy="20" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="56" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="65" cy="22" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M34 52 C38 48 46 48 48 56 C46 62 38 62 34 58 Z"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M30 64 C32 56 40 54 48 54"
          fill="none"
          stroke="#7C2D12"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <ellipse cx="44" cy="54" rx="2.8" ry="3.2" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
      </g>
    ),
  },

  G: {
    id: "G",
    name: "G",
    description: "Indicador apontando para cima, polegar estendido lateralmente a 90 graus",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C34 68 30 60 30 48 L32 44 C34 44 40 46 44 46 L45 20 C45 14 51 14 52 20 L53 58 C53 66 60 70 60 76 L58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="48" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M30 46 C24 46 22 52 22 58 C22 64 28 66 38 66"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="25" cy="54" rx="2.8" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M45 32 H51 M45 42 H51"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  H: {
    id: "H",
    name: "H",
    description: "Indicador e médio estendidos horizontalmente com rotação de pulso",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M44 88 L44 68 C40 68 36 62 36 52 C36 44 42 40 50 40 L76 40 C82 40 82 46 76 46 L54 47 L76 49 C82 49 82 55 76 55 L52 56 C48 66 54 74 56 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="78" cy="43" rx="3" ry="2.2" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="78" cy="52" rx="3" ry="2.2" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M32 46 C26 50 26 58 32 62"
          fill="none"
          stroke="url(#librasMotion)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <polyline points="34,44 32,48 28,47" fill="none" stroke="url(#librasMotion)" strokeWidth="2" strokeLinecap="round" />
      </g>
    ),
  },

  I: {
    id: "I",
    name: "I",
    description: "Dedo mínimo estendido verticalmente para cima, punho fechado",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 72 C32 70 28 62 28 48 C28 38 34 34 46 34 C54 34 60 38 62 46 L63 22 C63 16 68 16 69 22 L70 64 C70 74 62 82 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="66" cy="20" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M32 46 C38 43 52 43 58 47"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M32 55 C38 52 52 52 58 56"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M32 64 C38 61 52 61 57 65"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M64 34 H69 M64 44 H69"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  J: {
    id: "J",
    name: "J",
    description: "Dedo mínimo estendido desenhando a curva do J no ar",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M38 84 L36 68 C30 66 26 58 26 46 C26 36 32 32 44 32 C52 32 58 36 60 44 L61 24 C61 18 66 18 67 24 L68 62 C68 72 60 78 56 84 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="64" cy="22" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M66 36 C68 50 68 64 62 76 C56 86 44 88 38 84"
          fill="none"
          stroke="url(#librasMotion)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="4 3"
        />
        <polyline points="42,88 36,84 39,78" fill="none" stroke="url(#librasMotion)" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    ),
  },

  K: {
    id: "K",
    name: "K",
    description: "Indicador e médio em V com polegar no meio e impulso para cima",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C34 68 30 60 30 52 L36 24 C37 18 43 18 44 24 L48 50 L56 22 C58 16 64 18 63 24 L56 56 C56 68 60 78 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="40" cy="22" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="60" cy="22" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M38 58 C42 50 52 50 56 58"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M50 12 L50 6 M46 9 L50 5 L54 9"
          fill="none"
          stroke="url(#librasMotion)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  L: {
    id: "L",
    name: "L",
    description: "Indicador ereto para cima e polegar aberto a 90 graus formando o L",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M42 88 L42 66 C36 66 34 60 34 54 L34 52 L22 52 C16 52 16 46 22 46 L42 46 L43 20 C43 14 49 14 50 20 L51 66 C51 76 58 82 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="46" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="20" cy="49" rx="3.5" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M43 30 H49 M43 40 H49"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M44 60 C48 58 54 60 56 64"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  M: {
    id: "M",
    name: "M",
    description: "Três dedos curvados para baixo sobre a palma",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M42 20 L42 38 C34 38 30 46 30 56 L32 74 C32 80 37 80 38 74 L40 54 L41 76 C41 82 46 82 47 76 L48 54 L49 74 C49 80 54 80 55 74 L56 50 C58 42 62 38 64 36 L64 20 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="35" cy="76" rx="2.5" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="44" cy="78" rx="2.5" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="52" cy="76" rx="2.5" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M34 46 H54 M35 56 H53"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  N: {
    id: "N",
    name: "N",
    description: "Dois dedos curvados para baixo sobre o polegar recolhido",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M42 20 L42 38 C34 38 32 46 32 56 L34 76 C34 82 39 82 40 76 L42 54 L44 76 C44 82 49 82 50 76 L52 50 C54 42 58 38 62 36 L62 20 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="37" cy="78" rx="2.5" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="47" cy="78" rx="2.5" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M36 46 H48 M37 56 H47"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  O: {
    id: "O",
    name: "O",
    description: "Dedos e polegar unidos formando um círculo fechado O",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <ellipse cx="50" cy="52" rx="20" ry="24" fill="url(#librasSkin)" stroke="#7C2D12" strokeWidth="2.4" />
        <ellipse cx="50" cy="52" rx="9" ry="12" fill="url(#librasPalm)" stroke="#7C2D12" strokeWidth="2.2" />
        <path
          d="M42 88 L42 74 C46 76 54 76 58 74 L58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M34 44 C38 48 42 54 42 60"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M66 44 C62 48 58 54 58 60"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  P: {
    id: "P",
    name: "P",
    description: "Configuração do K inclinada horizontalmente para a frente/baixo",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 20 L40 40 C34 42 30 50 30 58 L36 82 C37 88 43 86 44 80 L48 56 L56 84 C58 90 64 88 63 82 L56 50 C56 40 60 30 58 20 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="40" cy="82" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="60" cy="84" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M38 48 C42 56 52 56 56 48"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </g>
    ),
  },

  Q: {
    id: "Q",
    name: "Q",
    description: "Indicador e polegar estendidos voltados para baixo",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M42 20 L42 42 C36 42 32 48 32 56 L24 56 C18 56 18 62 24 62 L44 62 L45 84 C45 90 51 90 52 84 L53 44 C53 34 58 28 58 20 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="48" cy="86" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="22" cy="59" rx="3.5" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M45 74 H51 M45 64 H51"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  R: {
    id: "R",
    name: "R",
    description: "Dedos indicador e médio cruzados estendidos para cima",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C32 68 28 60 30 48 C32 38 40 34 46 34 L54 18 C56 12 62 14 60 20 L48 54 L44 20 C43 14 37 14 38 20 L48 50 C50 62 58 76 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="57" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="41" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M34 54 C40 50 52 50 56 56"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
    ),
  },

  S: {
    id: "S",
    name: "S",
    description: "Punho fechado com o polegar repousado sobre a frente dos dedos",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M38 88 L36 74 C28 72 26 62 26 50 C26 36 34 32 46 32 C58 32 66 36 66 50 C66 62 64 72 58 74 L58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M30 44 C38 40 54 40 62 44"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M30 52 C38 48 54 48 62 52"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M32 62 C38 58 54 58 60 62"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M26 56 C26 48 38 46 56 50 C62 51 64 58 58 62 C46 68 34 66 28 64 Z"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <ellipse cx="58" cy="56" rx="3.5" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M38 56 C44 55 50 56 54 58"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  T: {
    id: "T",
    name: "T",
    description: "Indicador dobrado com polegar posicionado pelo lado de dentro",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C34 68 32 60 34 52 L36 50 L44 22 C44 16 49 16 50 22 L51 48 L53 20 C53 14 58 14 59 20 L60 48 L62 24 C62 18 67 18 68 24 L69 66 C69 76 60 82 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="47" cy="20" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="56" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="65" cy="22" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M30 62 C34 54 44 54 48 60 C44 68 34 68 30 62 Z"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M34 52 C38 46 48 48 46 56"
          fill="none"
          stroke="#7C2D12"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <ellipse cx="44" cy="58" rx="2.8" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
      </g>
    ),
  },

  U: {
    id: "U",
    name: "U",
    description: "Indicador e médio estendidos para cima bem colados juntos",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C32 68 30 60 30 48 C32 38 40 34 42 34 L43 18 C43 12 48 12 49 18 L50 48 L51 18 C51 12 56 12 57 18 L58 50 C60 60 60 74 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <line x1="50" y1="18" x2="50" y2="48" stroke="#9A3412" strokeWidth="1.6" />
        <ellipse cx="46" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="54" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M34 56 C40 50 52 50 56 56"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
    ),
  },

  V: {
    id: "V",
    name: "V",
    description: "Indicador e médio estendidos e abertos em V",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C32 68 28 60 28 48 C30 38 36 34 38 34 L36 20 C36 14 42 14 43 20 L48 50 L56 20 C58 14 64 14 63 20 L58 50 C58 62 60 76 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="39" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="60" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M36 56 C40 50 52 50 56 56"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
    ),
  },

  W: {
    id: "W",
    name: "W",
    description: "Indicador, médio e anelar estendidos e abertos em W",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C32 68 28 60 28 48 L32 22 C32 16 38 16 39 22 L44 50 L49 18 C49 12 55 12 55 18 L58 50 L64 22 C65 16 71 16 71 22 L66 52 C64 64 62 76 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="35" cy="20" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="52" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="68" cy="20" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M38 58 C42 52 54 52 58 58"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
    ),
  },

  X: {
    id: "X",
    name: "X",
    description: "Indicador curvado em forma de gancho puxando em direção ao corpo",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 72 C32 70 28 62 28 48 C28 38 34 34 44 34 C44 26 54 26 56 34 C56 40 50 42 46 44 L48 54 C56 54 62 62 62 72 L58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="54" cy="30" rx="2.5" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M34 54 C40 48 52 48 56 54"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M66 38 C62 38 60 42 60 46 M64 42 L60 46 L64 50"
          fill="none"
          stroke="url(#librasMotion)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  Y: {
    id: "Y",
    name: "Y",
    description: "Polegar e dedo mínimo estendidos para fora, dedos centrais recolhidos",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M42 88 L40 70 C36 70 30 64 30 52 L20 42 C15 37 19 32 25 36 L36 48 C40 38 48 36 56 46 L68 36 C74 32 78 37 73 42 L62 54 C60 64 58 76 56 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="21" cy="38" rx="3.5" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="72" cy="38" rx="3.5" ry="2.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M38 54 C44 50 50 50 54 54"
          fill="none"
          stroke="#9A3412"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  Z: {
    id: "Z",
    name: "Z",
    description: "Indicador estendido traçando a letra Z no ar",
    category: "letter",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C32 68 28 60 28 48 C30 38 36 34 42 34 L45 18 C45 12 51 12 52 18 L54 50 C58 60 60 74 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="48" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path
          d="M34 54 C40 48 52 48 56 54"
          fill="url(#librasSkinLight)"
          stroke="#7C2D12"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M58 20 H74 L60 36 H76"
          fill="none"
          stroke="url(#librasMotion)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 3"
        />
        <polyline points="72,32 76,36 71,39" fill="none" stroke="url(#librasMotion)" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    ),
  },

  "0": {
    id: "0",
    name: "0",
    description: "Mão fechada em formato oval redondo de número zero",
    category: "number",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <ellipse cx="50" cy="50" rx="18" ry="22" fill="url(#librasSkin)" stroke="#7C2D12" strokeWidth="2.4" />
        <ellipse cx="50" cy="50" rx="8" ry="11" fill="url(#librasPalm)" stroke="#7C2D12" strokeWidth="2.2" />
        <path d="M42 88 L42 72 C46 74 54 74 58 72 L58 88 Z" fill="url(#librasSkin)" stroke="#7C2D12" strokeWidth="2.2" />
      </g>
    ),
  },

  "1": {
    id: "1",
    name: "1",
    description: "Indicador estendido para cima",
    category: "number",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C32 68 28 60 28 48 C30 38 36 34 42 34 L45 16 C45 10 51 10 52 16 L54 50 C58 60 60 74 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="48" cy="14" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path d="M34 54 C40 48 52 48 56 54" fill="url(#librasSkinLight)" stroke="#7C2D12" strokeWidth="2" strokeLinejoin="round" />
      </g>
    ),
  },

  "2": {
    id: "2",
    name: "2",
    description: "Indicador e médio estendidos para cima",
    category: "number",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C32 68 28 60 28 48 C30 38 36 34 38 34 L36 18 C36 12 42 12 43 18 L48 48 L56 18 C58 12 64 12 63 18 L58 50 C58 62 60 76 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="39" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="60" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path d="M36 56 C40 50 52 50 56 56" fill="url(#librasSkinLight)" stroke="#7C2D12" strokeWidth="2" strokeLinejoin="round" />
      </g>
    ),
  },

  "3": {
    id: "3",
    name: "3",
    description: "Polegar, indicador e médio estendidos",
    category: "number",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C34 68 30 62 30 52 L22 46 C17 42 21 36 27 40 L36 46 L42 18 C43 12 49 12 50 18 L54 48 L60 20 C62 14 68 14 67 20 L62 52 C62 64 60 76 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="23" cy="42" rx="3" ry="2.2" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="46" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="64" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
      </g>
    ),
  },

  "4": {
    id: "4",
    name: "4",
    description: "Quatro dedos estendidos para cima, polegar recolhido",
    category: "number",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 66 C32 66 30 54 32 40 L33 20 C33 14 38 14 39 20 L40 48 L42 16 C42 10 47 10 48 16 L49 48 L51 17 C51 11 56 11 57 17 L58 50 L60 22 C60 16 65 16 66 22 L67 62 C67 74 61 80 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="36" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="45" cy="14" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="54" cy="15" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="63" cy="20" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path d="M32 66 C36 60 48 58 56 62" fill="url(#librasSkinLight)" stroke="#7C2D12" strokeWidth="2.2" strokeLinejoin="round" />
      </g>
    ),
  },

  "5": {
    id: "5",
    name: "5",
    description: "Cinco dedos abertos e estendidos",
    category: "number",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 66 C32 66 28 58 26 50 L18 44 C13 40 17 34 23 38 L30 46 L34 20 C35 14 41 14 42 20 L45 46 L50 16 C51 10 57 10 57 16 L59 48 L64 18 C65 12 71 12 71 18 L68 50 L74 24 C75 18 81 20 79 26 L70 64 C68 76 60 82 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="20" cy="40" rx="3" ry="2.2" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="38" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="54" cy="14" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="67" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="76" cy="22" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
      </g>
    ),
  },

  SIM: {
    id: "SIM",
    name: "SIM",
    description: "Sinal afirmativo em Libras com punho em movimento vertical",
    category: "concept",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M38 84 L36 70 C28 68 26 58 26 46 C26 32 34 28 46 28 C58 28 66 32 66 46 C66 58 64 68 58 70 L58 84 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M26 52 C26 44 38 42 56 46 C62 47 64 54 58 58 C46 64 34 62 28 60 Z" fill="url(#librasSkinLight)" stroke="#7C2D12" strokeWidth="2.4" strokeLinejoin="round" />
        <ellipse cx="58" cy="52" rx="3.5" ry="3" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path d="M50 14 V8 M46 11 L50 7 L54 11" fill="none" stroke="url(#librasMotion)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M50 94 V88 M46 91 L50 95 L54 91" fill="none" stroke="url(#librasMotion)" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    ),
  },

  NAO: {
    id: "NAO",
    name: "NÃO",
    description: "Sinal negativo em Libras com indicador balançando horizontalmente",
    category: "concept",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C32 68 28 60 28 48 C30 38 36 34 42 34 L45 16 C45 10 51 10 52 16 L54 50 C58 60 60 74 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="48" cy="14" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path d="M34 54 C40 48 52 48 56 54" fill="url(#librasSkinLight)" stroke="#7C2D12" strokeWidth="2" strokeLinejoin="round" />
        <path d="M32 20 C40 14 56 14 64 20" fill="none" stroke="url(#librasMotion)" strokeWidth="2.6" strokeLinecap="round" />
        <polyline points="30,18 34,22 38,18" fill="none" stroke="url(#librasMotion)" strokeWidth="2.2" strokeLinecap="round" />
        <polyline points="66,18 62,22 58,18" fill="none" stroke="url(#librasMotion)" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    ),
  },

  OBRIGADO: {
    id: "OBRIGADO",
    name: "OBRIGADO",
    description: "Mão na testa saindo em direção ao interlocutor",
    category: "concept",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M34 88 L34 60 C30 56 28 48 30 36 L32 24 C32 18 38 18 39 24 L42 46 L45 20 C46 14 52 14 52 20 L54 46 L58 22 C59 16 65 16 65 22 L66 48 L70 26 C71 20 77 20 76 26 L72 62 C70 76 62 82 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="36" cy="22" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="49" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="62" cy="20" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="73" cy="24" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path d="M54 70 L72 82 M66 84 L72 82 L70 76" fill="none" stroke="url(#librasMotion)" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    ),
  },

  OLA: {
    id: "OLA",
    name: "OLÁ",
    description: "Mão espalmada em aceno de saudação",
    category: "concept",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 66 C32 66 28 58 26 50 L18 44 C13 40 17 34 23 38 L30 46 L34 20 C35 14 41 14 42 20 L45 46 L50 16 C51 10 57 10 57 16 L59 48 L64 18 C65 12 71 12 71 18 L68 50 L74 24 C75 18 81 20 79 26 L70 64 C68 76 60 82 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="38" cy="18" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="54" cy="14" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="67" cy="16" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <ellipse cx="76" cy="22" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path d="M26 18 C34 12 62 10 74 16" fill="none" stroke="url(#librasMotion)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="3 3" />
      </g>
    ),
  },

  IDEIA: {
    id: "IDEIA",
    name: "IDEIA",
    description: "Indicador na têmpora com irradiação de luz para cima",
    category: "concept",
    svgPaths: (
      <g filter="url(#librasGlow)">
        <path
          d="M40 88 L38 68 C32 68 28 60 28 48 C30 38 36 34 42 34 L45 22 C45 16 51 16 52 22 L54 50 C58 60 60 74 58 88 Z"
          fill="url(#librasSkin)"
          stroke="#7C2D12"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="48" cy="20" rx="2.5" ry="3.5" fill="url(#librasNail)" stroke="#9A3412" strokeWidth="1" />
        <path d="M34 54 C40 48 52 48 56 54" fill="url(#librasSkinLight)" stroke="#7C2D12" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="48" cy="10" r="4" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5" />
        <path d="M48 2 V-2 M38 5 L34 2 M58 5 L62 2" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    ),
  },
};

export function resolveLibrasGlyph(raw: string): LibrasSignDefinition {
  const upper = raw.trim().toUpperCase();
  if (LIBRAS_DICTIONARY[upper]) {
    return LIBRAS_DICTIONARY[upper];
  }

  const clean = upper.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (LIBRAS_DICTIONARY[clean]) {
    return LIBRAS_DICTIONARY[clean];
  }

  return LIBRAS_DICTIONARY.REST;
}

export function LibrasHandSign({
  glyph,
  size = 140,
  className,
}: {
  glyph: string;
  size?: number;
  className?: string;
}) {
  const sign = resolveLibrasGlyph(glyph);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center select-none overflow-hidden transition-all",
        className
      )}
      style={{ width: size, height: size }}
      aria-label={`Sinal de Libras: ${sign.name}`}
    >
      <motion.div
        key={sign.id}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="size-full flex items-center justify-center"
      >
        <svg
          viewBox="0 0 100 100"
          className="size-full overflow-visible drop-shadow-[0_8px_16px_rgba(154,52,18,0.18)]"
        >
          <SkinDefs />
          {sign.svgPaths}
        </svg>
      </motion.div>
    </div>
  );
}
