type IconProps = {
  className?: string;
  strokeWidth?: number;
};

function base(strokeWidth = 1.5) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function FlashcardsIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <path d="M8.5 6.75V5.25A2.5 2.5 0 0 1 11 2.75h7.5A2.5 2.5 0 0 1 21 5.25v7.5a2.5 2.5 0 0 1-2.5 2.5H17" />
      <rect x="3" y="6.75" width="14" height="14.25" rx="2.75" />
      <path d="M6.75 11.75h6.5" />
      <path d="M6.75 15.5h4" />
    </svg>
  );
}

export function CardFlipIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="2.75" />
      <path d="M12 4.75v14.5" strokeDasharray="1.6 2.2" />
      <path d="M7.75 15.25a3.25 3.25 0 0 1 0-6.5h.9" />
      <path d="M7.4 7.1 8.9 8.75 7.4 10.4" />
    </svg>
  );
}

export function DeckIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <path d="M4.75 4.5A1.75 1.75 0 0 1 6.5 2.75h11.25a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5H6.5A1.75 1.75 0 0 1 4.75 19z" />
      <path d="M4.75 17h14.5" />
      <path d="M8.5 6.75h6.5" />
    </svg>
  );
}

export function MemoryIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <circle cx="6" cy="7" r="2.1" />
      <circle cx="17.5" cy="5.75" r="1.9" />
      <circle cx="18" cy="16.75" r="2.1" />
      <circle cx="6.75" cy="17.25" r="1.9" />
      <path d="M7.9 8.45 16 15.6" />
      <path d="M8 6.5h7.6" />
      <path d="M8.4 16.1l7.6-8.7" />
    </svg>
  );
}

export function DueIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <path d="M7 2.75h10" />
      <path d="M7 21.25h10" />
      <path d="M7.75 2.75v3.1c0 2.2 1.55 3.35 3.1 4.9.6.6.6 1.1 0 1.7-1.55 1.55-3.1 2.7-3.1 4.9v3.9" />
      <path d="M16.25 2.75v3.1c0 2.2-1.55 3.35-3.1 4.9-.6.6-.6 1.1 0 1.7 1.55 1.55 3.1 2.7 3.1 4.9v3.9" />
      <path d="M9.6 18.4c0-1.2 1.05-1.95 2.4-1.95s2.4.75 2.4 1.95" />
    </svg>
  );
}

export function GoalIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <circle cx="12" cy="12" r="8.75" />
      <circle cx="12" cy="12" r="4.75" opacity="0.55" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MasteredIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="m8.25 12.3 2.6 2.6 5-5.6" />
    </svg>
  );
}

export function LearningIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <path d="M12 20.75v-8.5" />
      <path d="M12 13.5c0-3 2.15-5.4 5.15-5.75.35 3-1.9 5.75-5.15 5.75z" />
      <path d="M11.9 15.1C11.9 12.9 10.35 11.1 8.1 10.8c-.25 2.2 1.4 4.3 3.8 4.3z" opacity="0.55" />
      <path d="M6.5 20.75h11" />
    </svg>
  );
}

export function SparkIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <path d="M12 2.75c.55 3.9 2.6 5.95 6.5 6.5-3.9.55-5.95 2.6-6.5 6.5-.55-3.9-2.6-5.95-6.5-6.5 3.9-.55 5.95-2.6 6.5-6.5z" />
      <path d="M18.15 16.1c.28 1.55 1.1 2.35 2.6 2.6-1.5.25-2.32 1.05-2.6 2.55-.27-1.5-1.1-2.3-2.6-2.55 1.5-.25 2.33-1.05 2.6-2.6z" opacity="0.6" />
    </svg>
  );
}

export function HintIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <path d="M9.25 17.5a5.75 5.75 0 1 1 5.5 0v1.25a1.5 1.5 0 0 1-1.5 1.5h-2.5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M9.6 17.5h4.8" />
    </svg>
  );
}

export function ReplayIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <path d="M3.9 12a8.1 8.1 0 1 0 2.5-5.85" />
      <path d="M3.25 3.5v4.4h4.4" />
    </svg>
  );
}

export function RevealIcon({ className, strokeWidth }: IconProps) {
  return (
    <svg {...base(strokeWidth)} className={className}>
      <path d="M2.75 12S6.4 5.75 12 5.75 21.25 12 21.25 12 17.6 18.25 12 18.25 2.75 12 2.75 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function StudyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8.2 5.4a1.1 1.1 0 0 1 1.68-.94l8.1 5.1a1.7 1.7 0 0 1 0 2.88l-8.1 5.1A1.1 1.1 0 0 1 8.2 16.6z" />
    </svg>
  );
}
