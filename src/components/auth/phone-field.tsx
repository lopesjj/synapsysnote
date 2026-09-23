"use client";

import { Input } from "@/components/ui/primitives";
import { formatPhone } from "@/lib/phone";
import { useTranslation } from "@/lib/i18n/translations";
import { AuthField } from "./auth-field";

export function PhoneField({
  value,
  onChange,
  required = true,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const { t, textDir } = useTranslation();
  return (
    <AuthField label={t("field_phone")}>
      <Input
        type="tel"
        dir="ltr"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        value={value}
        onChange={(event) => onChange(formatPhone(event.target.value))}
        placeholder="(11) 98765-4321"
        aria-describedby="phone-field-hint"
      />
      <span id="phone-field-hint" dir={textDir} className="block text-start text-[11px] leading-snug text-faint">
        {t("phone_hint")}
      </span>
    </AuthField>
  );
}
