import { cn } from "@/lib/utils";
import { FLAG_CODE_SET, flagEmojiFromCode } from "./flag-codes";

const RI_START = 0x1f1e6;
const RI_END = 0x1f1ff;

export type WorkspaceIconVariant = "hero" | "list" | "nav";

export const WORKSPACE_ICON_HERO_PX = 160;
export const WORKSPACE_ICON_HERO_EMOJI_PX = 44;

export function workspaceHeroSize(icon?: string | null) {
  return isIconUrl(icon?.trim() || "") ? WORKSPACE_ICON_HERO_PX : WORKSPACE_ICON_HERO_EMOJI_PX;
}

/** Halo so the hero icon sits on the cover without looking pasted on. */
export const workspaceIconOnCoverClass =
  "bg-white shadow-[0_12px_32px_rgba(15,23,42,0.16)] ring-[6px] ring-[var(--canvas)]";

const VARIANT_PX: Record<WorkspaceIconVariant, number> = {
  hero: WORKSPACE_ICON_HERO_PX,
  list: 20,
  nav: 18,
};

/** ISO code from a flag emoji, or from a stored "BR" / "br" text fallback. */
export function flagCountryCode(value: string): string | null {
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return FLAG_CODE_SET.has(upper) ? upper : null;
  }
  const points = [...trimmed].map((char) => char.codePointAt(0) ?? 0);
  const ris = points.filter((point) => point >= RI_START && point <= RI_END);
  if (ris.length < 2) return null;
  const code = String.fromCodePoint(ris[0] - RI_START + 65, ris[1] - RI_START + 65);
  return FLAG_CODE_SET.has(code) ? code : code;
}

export function isIconUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("data:image/");
}

export function WorkspaceIcon({
  icon,
  fallback = "📄",
  size,
  variant,
  className,
}: {
  icon?: string | null;
  fallback?: string;
  size?: number;
  variant?: WorkspaceIconVariant;
  className?: string;
}) {
  const value = icon?.trim() || fallback;
  const flag = flagCountryCode(value);
  const image = isIconUrl(value);
  const px =
    variant === "hero"
      ? image
        ? WORKSPACE_ICON_HERO_PX
        : WORKSPACE_ICON_HERO_EMOJI_PX
      : variant
        ? VARIANT_PX[variant]
        : (size ?? 16);

  if (image) {
    const hero = variant === "hero";
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden",
          hero ? "rounded-[28px] bg-white p-2 shadow-sm" : "rounded-[5px]",
          className,
          hero && "bg-white"
        )}
        style={{ width: px, height: px }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt=""
          width={px}
          height={px}
          className={
            hero
              ? "max-h-full max-w-full object-contain object-center"
              : "size-full object-cover object-[center_14%]"
          }
        />
      </span>
    );
  }

  if (flag) {
    const height = variant === "hero" ? Math.round(px * 0.72) : Math.max(10, Math.round(px * 0.75));
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://flagcdn.com/${flag.toLowerCase()}.svg`}
        alt={flag}
        width={px}
        height={height}
        className={cn(
          "inline-block shrink-0 object-cover",
          variant === "hero" ? "rounded-[16px] shadow-sm" : "rounded-[2px]",
          className
        )}
        style={{ width: px, height }}
      />
    );
  }

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center leading-none", className)}
      style={{
        fontSize: px,
        width: px,
        height: px,
      }}
    >
      {value}
    </span>
  );
}

export function firstCustomIcon(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isIconUrl(trimmed)) return trimmed;
  const fromLetters = flagCountryCode(trimmed);
  if (fromLetters && /^[A-Za-z]{2}$/.test(trimmed)) return flagEmojiFromCode(fromLetters);
  const flag = flagCountryCode(trimmed);
  if (flag) return flagEmojiFromCode(flag);
  try {
    const segmenter = new Intl.Segmenter("pt", { granularity: "grapheme" });
    return [...segmenter.segment(trimmed)][0]?.segment ?? null;
  } catch {
    return [...trimmed][0] ?? null;
  }
}
