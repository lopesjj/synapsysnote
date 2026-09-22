import type { ReactNode } from "react";

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span dir="auto" className="text-left block text-[11.5px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
