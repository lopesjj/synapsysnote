import type { ParsedElement } from "./dom";

export interface StyleRule {
  tag: string | null;
  classes: string[];
  id: string | null;
  order: number;
  specificity: number;
  declarations: Record<string, string>;
}

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  silver: "#C0C0C0",
  gray: "#808080",
  grey: "#808080",
  white: "#FFFFFF",
  maroon: "#800000",
  red: "#FF0000",
  purple: "#800080",
  fuchsia: "#FF00FF",
  magenta: "#FF00FF",
  green: "#008000",
  lime: "#00FF00",
  olive: "#808000",
  yellow: "#FFFF00",
  navy: "#000080",
  blue: "#0000FF",
  teal: "#008080",
  aqua: "#00FFFF",
  cyan: "#00FFFF",
  orange: "#FFA500",
  pink: "#FFC0CB",
  brown: "#A52A2A",
  gold: "#FFD700",
  violet: "#EE82EE",
  indigo: "#4B0082",
  darkgray: "#A9A9A9",
  darkgrey: "#A9A9A9",
  lightgray: "#D3D3D3",
  lightgrey: "#D3D3D3",
  darkblue: "#00008B",
  darkgreen: "#006400",
  darkred: "#8B0000",
  lightblue: "#ADD8E6",
  lightgreen: "#90EE90",
  lightyellow: "#FFFFE0",
  beige: "#F5F5DC",
  ivory: "#FFFFF0",
  khaki: "#F0E68C",
  salmon: "#FA8072",
  turquoise: "#40E0D0",
  tan: "#D2B48C",
  crimson: "#DC143C",
};

export function parseDeclarations(input: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  if (!input) return declarations;
  for (const chunk of splitTopLevel(input, ";")) {
    const colon = chunk.indexOf(":");
    if (colon <= 0) continue;
    const property = chunk.slice(0, colon).trim().toLowerCase();
    const value = chunk.slice(colon + 1).trim();
    if (!property || !value) continue;
    declarations[property] = value;
  }
  return declarations;
}

function splitTopLevel(input: string, separator: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const char of input) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.map((value) => value.trim()).filter(Boolean);
}

function parseSelector(selector: string, order: number, declarations: Record<string, string>): StyleRule | null {
  const cleaned = selector.trim();
  if (!cleaned || /[\s>+~[:]/.test(cleaned)) return null;
  const classes: string[] = [];
  let tag: string | null = null;
  let id: string | null = null;
  const pattern = /([.#]?)([A-Za-z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = pattern.exec(cleaned))) {
    consumed += match[0].length;
    if (match[1] === ".") classes.push(match[2]);
    else if (match[1] === "#") id = match[2];
    else tag = match[2].toLowerCase();
  }
  if (consumed !== cleaned.length) return null;
  if (!tag && !classes.length && !id) return null;
  const specificity = (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0);
  return { tag, classes, id, order, specificity, declarations };
}

export function parseStyleSheet(css: string): StyleRule[] {
  const rules: StyleRule[] = [];
  if (!css) return rules;
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let index = 0;
  let order = 0;

  while (index < source.length) {
    const braceOpen = source.indexOf("{", index);
    const semicolon = source.indexOf(";", index);
    if (semicolon !== -1 && (braceOpen === -1 || semicolon < braceOpen)) {
      index = semicolon + 1;
      continue;
    }
    if (braceOpen === -1) break;
    const prelude = source.slice(index, braceOpen).trim();

    if (prelude.startsWith("@")) {
      const nested = /^@(media|supports|document|layer)/i.test(prelude);
      let depth = 1;
      let cursor = braceOpen + 1;
      while (cursor < source.length && depth > 0) {
        if (source[cursor] === "{") depth += 1;
        else if (source[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      if (nested) {
        const inner = source.slice(braceOpen + 1, Math.max(braceOpen + 1, cursor - 1));
        for (const rule of parseStyleSheet(inner)) {
          rules.push({ ...rule, order: order++ });
        }
      }
      index = cursor;
      continue;
    }

    const braceClose = source.indexOf("}", braceOpen + 1);
    const body = source.slice(braceOpen + 1, braceClose === -1 ? source.length : braceClose);
    const declarations = parseDeclarations(body);
    if (Object.keys(declarations).length) {
      for (const selector of splitTopLevel(prelude, ",")) {
        const rule = parseSelector(selector, order++, declarations);
        if (rule) rules.push(rule);
      }
    }
    index = braceClose === -1 ? source.length : braceClose + 1;
  }

  return rules;
}

function matches(rule: StyleRule, tag: string, classes: Set<string>, id: string | undefined): boolean {
  if (rule.tag && rule.tag !== tag) return false;
  if (rule.id && rule.id !== id) return false;
  for (const className of rule.classes) {
    if (!classes.has(className)) return false;
  }
  return true;
}

export function createStyleResolver(rules: StyleRule[]) {
  const cache = new Map<ParsedElement, Record<string, string>>();
  const sorted = [...rules].sort((a, b) => a.specificity - b.specificity || a.order - b.order);

  return (element: ParsedElement): Record<string, string> => {
    const cached = cache.get(element);
    if (cached) return cached;
    const classAttr = element.attrs.class ?? "";
    const classes = new Set(classAttr.split(/\s+/).filter(Boolean));
    const id = element.attrs.id;
    const computed: Record<string, string> = {};
    if (sorted.length) {
      for (const rule of sorted) {
        if (!matches(rule, element.name, classes, id)) continue;
        Object.assign(computed, rule.declarations);
      }
    }
    const inline = element.attrs.style ? parseDeclarations(element.attrs.style) : null;
    if (inline) Object.assign(computed, inline);
    cache.set(element, computed);
    return computed;
  };
}

export function normalizeColor(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value || value === "inherit" || value === "initial" || value === "currentcolor") return null;
  if (value === "transparent" || value === "none") return null;
  if (NAMED_COLORS[value]) return NAMED_COLORS[value];
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (/^[0-9a-f]{3}$/.test(hex)) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase();
    }
    if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`.toUpperCase();
    if (/^[0-9a-f]{8}$/.test(hex)) return `#${hex.slice(0, 6)}`.toUpperCase();
    return null;
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const alpha = parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
    if (Number.isFinite(alpha) && alpha === 0) return null;
    const channels = parts.slice(0, 3).map((part) => {
      if (part.endsWith("%")) {
        const pct = Number.parseFloat(part);
        return Number.isFinite(pct) ? Math.round((pct / 100) * 255) : 0;
      }
      const num = Number.parseFloat(part);
      return Number.isFinite(num) ? Math.round(num) : 0;
    });
    return `#${channels.map((c) => clampChannel(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`.toUpperCase();
  return null;
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, value));
}

export function colorLuminance(hex: string): number {
  const value = hex.replace("#", "");
  if (value.length !== 6) return 0.5;
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function parseLengthPx(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  const match = /^(-?[0-9]*\.?[0-9]+)\s*(px|pt|pc|in|cm|mm|em|rem|%)?$/.exec(value);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  switch (match[2]) {
    case "pt":
      return (amount * 96) / 72;
    case "pc":
      return (amount * 96) / 6;
    case "in":
      return amount * 96;
    case "cm":
      return (amount * 96) / 2.54;
    case "mm":
      return (amount * 96) / 25.4;
    case "em":
    case "rem":
      return amount * 16;
    case "%":
      return null;
    default:
      return amount;
  }
}
