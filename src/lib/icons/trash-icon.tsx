export function TrashCanIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.5 6.5h15" />
      <path d="M9 6.5V4.75a1.25 1.25 0 0 1 1.25-1.25h3.5a1.25 1.25 0 0 1 1.25 1.25V6.5" />
      <path d="M6 6.5l1.1 12.1a2 2 0 0 0 2 1.9h5.8a2 2 0 0 0 2-1.9L18 6.5" />
    </svg>
  );
}
