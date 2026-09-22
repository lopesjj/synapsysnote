import { HIGHLIGHT_COLORS, TEXT_COLORS } from "@/components/editor/editor-colors";

interface Hsl {
  hue: number;
  saturation: number;
  lightness: number;
}

function hexToHsl(hex: string): Hsl | null {
  const value = hex.replace("#", "");
  if (value.length !== 6) return null;
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { hue: 0, saturation: 0, lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;

  return { hue, saturation, lightness };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function buildPalette(entries: readonly { value: string | null }[]): { hex: string; hsl: Hsl }[] {
  const out: { hex: string; hsl: Hsl }[] = [];
  for (const entry of entries) {
    if (!entry.value) continue;
    const hsl = hexToHsl(entry.value);
    if (hsl) out.push({ hex: entry.value, hsl });
  }
  return out;
}

const TEXT_PALETTE = buildPalette(TEXT_COLORS);
const HIGHLIGHT_PALETTE = buildPalette(HIGHLIGHT_COLORS);

function snap(hex: string, palette: { hex: string; hsl: Hsl }[]): string | null {
  const source = hexToHsl(hex);
  if (!source || !palette.length) return null;

  const neutral = source.saturation < 0.12;
  const candidates = palette.filter((entry) => (neutral ? entry.hsl.saturation < 0.15 : entry.hsl.saturation >= 0.15));
  const pool = candidates.length ? candidates : palette;

  let best = pool[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const entry of pool) {
    const hue = neutral ? 0 : hueDistance(source.hue, entry.hsl.hue) / 180;
    const saturation = Math.abs(source.saturation - entry.hsl.saturation);
    const lightness = Math.abs(source.lightness - entry.hsl.lightness);
    const score = hue * 3 + saturation * 0.6 + lightness * 0.8;
    if (score < bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best.hex;
}

export function snapTextColor(hex: string): string | null {
  return snap(hex, TEXT_PALETTE);
}

export function snapHighlightColor(hex: string): string | null {
  return snap(hex, HIGHLIGHT_PALETTE);
}
