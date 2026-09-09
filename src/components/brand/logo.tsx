import { cn } from "@/lib/utils";


const WORDMARK_RATIO = 299 / 874;

export type LogoOrientation = "horizontal" | "vertical";

export const SIDEBAR_MARK_SIZE = 42;

export function SynapsysMark({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
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
  size?: number;
  orientation?: LogoOrientation;
  reversed?: boolean;
  markOnly?: boolean;
  letteringScale?: number;
}

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

export function SynapsysWordmark({
  className,
  size = 32,
  subtitle = true,
  orientation = "horizontal",
  reversed = false,
}: {
  className?: string;
  size?: number;
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

export function SynapsysLettering({
  className,
  size = SIDEBAR_MARK_SIZE,
}: {
  className?: string;
  size?: number;
}) {
  return <Wordmark width={letteringWidthFor(size, false)} className={className} />;
}

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
