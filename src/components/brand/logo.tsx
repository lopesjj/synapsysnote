import { cn } from "@/lib/utils";

/**
 * Synapsys Note brand lockups.
 *
 * The mark sits beside the wordmark by default. `vertical` stacks them for
 * rare tight spots; `reversed` flips the reading order.
 */

/** Intrinsic aspect ratio of the wordmark asset. */
const WORDMARK_RATIO = 299 / 874;

export type LogoOrientation = "horizontal" | "vertical";

/** Mark size shared by the expanded lockup and the collapsed sidebar rail. */
export const SIDEBAR_MARK_SIZE = 42;

export function SynapsysMark({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/synapsys-mark.png"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 select-none object-contain", className)}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

function Wordmark({ width, className }: { width: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/synapsys-wordmark.png"
      alt="Synapsys Note"
      width={width}
      height={Math.round(width * WORDMARK_RATIO)}
      className={cn("synapsys-wordmark select-none object-contain", className)}
      draggable={false}
    />
  );
}

interface LockupProps {
  className?: string;
  /** Height of the symbol in pixels; the lettering is scaled to match. */
  size?: number;
  orientation?: LogoOrientation;
  /** Puts the lettering before the symbol (right-to-left, or text above). */
  reversed?: boolean;
  /** Hides the lettering — used by the collapsed sidebar rail. */
  markOnly?: boolean;
  /**
   * Lettering height as a fraction of the mark. App chrome stays compact
   * (~0.78); the landing lockup uses a higher value so both sit as one mark.
   */
  letteringScale?: number;
}

/**
 * The complete lockup. `SynapsysWordmark` and `SynapsysLockup` below are thin
 * presets over this component so call sites stay readable.
 */
function letteringWidthFor(size: number, vertical: boolean, scale = 0.78) {
  return vertical ? Math.round(size * 1.55) : Math.round((size * scale) / WORDMARK_RATIO);
}

export function SynapsysLogo({
  className,
  size = 32,
  orientation = "horizontal",
  reversed = false,
  markOnly = false,
  letteringScale = 0.78,
}: LockupProps) {
  const vertical = orientation === "vertical";
  const wordmarkWidth = letteringWidthFor(size, vertical, letteringScale);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none",
        vertical
          ? cn("flex-col items-center", reversed ? "flex-col-reverse gap-2" : "gap-2")
          : cn("items-center", reversed ? "flex-row-reverse gap-2" : "gap-3.5"),
        className
      )}
    >
      <SynapsysMark size={size} />
      {markOnly ? null : (
        <Wordmark width={wordmarkWidth} className={vertical ? undefined : "origin-left"} />
      )}
    </span>
  );
}

/** Compact horizontal lockup for app chrome. */
export function SynapsysWordmark({
  className,
  size = 32,
  subtitle = true,
  orientation = "horizontal",
  reversed = false,
}: {
  className?: string;
  size?: number;
  /** Kept for call-site compatibility: `false` renders the symbol alone. */
  subtitle?: boolean;
  orientation?: LogoOrientation;
  reversed?: boolean;
}) {
  return (
    <SynapsysLogo
      className={className}
      size={size}
      orientation={orientation}
      reversed={reversed}
      markOnly={!subtitle}
    />
  );
}

/** Sidebar lettering only — same size as the original lockup, never scales with width. */
export function SynapsysLettering({
  className,
  size = SIDEBAR_MARK_SIZE,
}: {
  className?: string;
  size?: number;
}) {
  return <Wordmark width={letteringWidthFor(size, false)} className={className} />;
}

/** Large horizontal lockup for the landing hero. */
export function SynapsysLockup({
  className,
  size = 88,
  orientation = "horizontal",
  reversed = false,
}: {
  className?: string;
  size?: number;
  orientation?: LogoOrientation;
  reversed?: boolean;
}) {
  return (
    <SynapsysLogo
      className={cn("gap-5", className)}
      size={size}
      orientation={orientation}
      reversed={reversed}
      letteringScale={0.92}
    />
  );
}
