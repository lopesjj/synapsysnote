"use client";

import { useState } from "react";
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

export const workspaceIconOnCoverClass =
  "bg-white shadow-[0_12px_32px_rgba(15,23,42,0.16)] ring-[6px] ring-[var(--canvas)]";

const VARIANT_PX: Record<WorkspaceIconVariant, number> = {
  hero: WORKSPACE_ICON_HERO_PX,
  list: 20,
  nav: 18,
};

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

export function isExpiredNotionUrl(url: string): boolean {
  if (!url.includes("amazonaws.com") && !url.includes("notion.so")) return false;
  try {
    const parsed = new URL(url);
    const amzDate = parsed.searchParams.get("X-Amz-Date");
    const expires = parsed.searchParams.get("X-Amz-Expires");
    if (amzDate && expires) {
      const year = parseInt(amzDate.slice(0, 4), 10);
      const month = parseInt(amzDate.slice(4, 6), 10) - 1;
      const day = parseInt(amzDate.slice(6, 8), 10);
      const hour = parseInt(amzDate.slice(9, 11), 10);
      const min = parseInt(amzDate.slice(11, 13), 10);
      const sec = parseInt(amzDate.slice(13, 15), 10);
      const issuedAt = Date.UTC(year, month, day, hour, min, sec);
      const expireMs = parseInt(expires, 10) * 1000;
      if (Date.now() > issuedAt + expireMs) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function WorkspaceImageIcon({
  src,
  fallback,
  hero,
  px,
  className,
}: {
  src: string;
  fallback: string;
  hero: boolean;
  px: number;
  className?: string;
}) {
  const [hasError, setHasError] = useState(() => isExpiredNotionUrl(src));
  const safeFallback = isIconUrl(fallback) ? "📄" : fallback;

  if (hasError) {
    const flag = flagCountryCode(safeFallback);
    if (flag) {
      const height = hero ? undefined : Math.max(10, Math.round(px * 0.75));
      return (
        <img
          src={`https://flagcdn.com/${flag.toLowerCase()}.svg`}
          alt={flag}
          className={cn(
            "inline-block shrink-0 object-cover",
            hero
              ? "h-14 w-20 rounded-[12px] sm:h-24 sm:w-36 sm:rounded-[16px] shadow-sm"
              : "rounded-[2px]",
            className
          )}
          style={hero ? undefined : { width: px, height }}
        />
      );
    }

    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center leading-none",
          hero ? "text-[42px] sm:text-[54px]" : undefined,
          className
        )}
        style={hero ? undefined : { fontSize: px, width: px, height: px }}
      >
        {safeFallback}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        hero
          ? "size-24 rounded-[22px] sm:size-[160px] sm:rounded-[28px] bg-white p-2 shadow-sm"
          : "rounded-[5px]",
        className,
        hero && "bg-white"
      )}
      style={hero ? undefined : { width: px, height: px }}
    >
      <img
        src={src}
        alt=""
        onError={() => setHasError(true)}
        className={
          hero
            ? "max-h-full max-w-full object-contain object-center"
            : "size-full object-cover object-[center_14%]"
        }
      />
    </span>
  );
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
    return (
      <WorkspaceImageIcon
        src={value}
        fallback={fallback}
        hero={variant === "hero"}
        px={px}
        className={className}
      />
    );
  }

  if (flag) {
    const height = variant === "hero" ? undefined : Math.max(10, Math.round(px * 0.75));
    return (
      <img
        src={`https://flagcdn.com/${flag.toLowerCase()}.svg`}
        alt={flag}
        className={cn(
          "inline-block shrink-0 object-cover",
          variant === "hero"
            ? "h-14 w-20 rounded-[12px] sm:h-24 sm:w-36 sm:rounded-[16px] shadow-sm"
            : "rounded-[2px]",
          className
        )}
        style={variant === "hero" ? undefined : { width: px, height }}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none",
        variant === "hero" ? "text-[42px] sm:text-[54px]" : undefined,
        className
      )}
      style={
        variant === "hero"
          ? undefined
          : {
              fontSize: px,
              width: px,
              height: px,
            }
      }
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
