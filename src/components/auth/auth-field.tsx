import type { ReactNode } from "react";

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11.5px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
