"use client";

import type { ReactNode } from "react";
import { useTranslation } from "@/lib/i18n/translations";

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  const { textDir } = useTranslation();
  return (
    <label className="block space-y-1.5">
      <span dir={textDir} className="text-start block text-[11.5px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
