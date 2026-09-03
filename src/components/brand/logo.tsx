import { cn } from "@/lib/utils";

/**
 * Complete Synapsys Note brand lockup.
 *
 * The attached mark and wordmark are used as-is; only their *position* changes
 * relative to the original stacked file: the symbol sits on the left and the
 * original “Synapsys / Note” lettering sits to its right.
 */

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
      height={Math.round(size * (689 / 720))}
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}

export function SynapsysWordmark({
  className,
  size = 32,
  subtitle = true,
}: {
  className?: string;
  size?: number;
  subtitle?: boolean;
}) {
  const wordH = Math.max(18, Math.round(size * 0.78));
  const wordW = Math.round(wordH * (900 / 305));

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <SynapsysMark size={size} />
      {subtitle ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/brand/synapsys-wordmark.png"
          alt="Synapsys Note"
          width={wordW}
          height={wordH}
          className="synapsys-wordmark origin-left object-contain object-left"
          draggable={false}
        />
      ) : null}
    </span>
  );
}

/** Larger horizontal lockup for the landing hero — complete logo, text to the right of the mark. */
export function SynapsysLockup({
  className,
  size = 72,
}: {
  className?: string;
  size?: number;
}) {
  const wordH = Math.round(size * 0.72);
  const wordW = Math.round(wordH * (900 / 305));
  return (
    <span className={cn("inline-flex items-center gap-4", className)}>
      <SynapsysMark size={size} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/synapsys-wordmark.png"
        alt="Synapsys Note"
        width={wordW}
        height={wordH}
        className="synapsys-wordmark object-contain object-left"
        draggable={false}
      />
    </span>
  );
}
