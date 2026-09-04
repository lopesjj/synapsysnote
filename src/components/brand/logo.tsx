import { cn } from "@/lib/utils";

/**
 * Synapsys Note brand lockups.
 *
 * The original artwork stacks the symbol above the "Synapsys / Note" lettering.
 * Both elements are used exactly as drawn — only their arrangement changes, and
 * every call site picks it: `vertical` keeps the original stack (used on the
 * landing hero and the auth card), `horizontal` puts the symbol beside the
 * lettering for the tight rhythm of the sidebar and mobile header, and
 * `reversed` flips which of the two comes first.
 */

/** Intrinsic aspect ratios of the exported assets. */
const MARK_RATIO = 624 / 652;
const WORDMARK_RATIO = 299 / 874;

export type LogoOrientation = "horizontal" | "vertical";

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
      height={Math.round(size * MARK_RATIO)}
      className={cn("shrink-0 object-contain", className)}
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
      className={cn("synapsys-wordmark object-contain", className)}
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
}

/**
 * The complete lockup. `SynapsysWordmark` and `SynapsysLockup` below are thin
 * presets over this component so call sites stay readable.
 */
export function SynapsysLogo({
  className,
  size = 32,
  orientation = "horizontal",
  reversed = false,
  markOnly = false,
}: LockupProps) {
  const vertical = orientation === "vertical";
  // Beside the symbol the lettering reads best at ~78% of its height; stacked
  // underneath it wants to span a little wider than the symbol itself.
  const wordmarkWidth = vertical
    ? Math.round(size * 1.55)
    : Math.round(size * 0.78 / WORDMARK_RATIO);

  return (
    <span
      className={cn(
        "inline-flex",
        vertical
          ? cn("flex-col items-center", reversed ? "flex-col-reverse gap-2" : "gap-2.5")
          : cn("items-center", reversed ? "flex-row-reverse gap-2.5" : "gap-2.5"),
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

/** Large lockup for the landing hero — stacked, as in the original artwork. */
export function SynapsysLockup({
  className,
  size = 72,
  orientation = "vertical",
  reversed = false,
}: {
  className?: string;
  size?: number;
  orientation?: LogoOrientation;
  reversed?: boolean;
}) {
  return (
    <SynapsysLogo
      className={className}
      size={size}
      orientation={orientation}
      reversed={reversed}
    />
  );
}
