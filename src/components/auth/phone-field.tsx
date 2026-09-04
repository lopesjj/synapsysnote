"use client";

import { Input } from "@/components/ui/primitives";
import { formatPhoneBR } from "@/lib/phone";
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
  return (
    <AuthField label="Telefone">
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        required={required}
        value={value}
        onChange={(event) => onChange(formatPhoneBR(event.target.value))}
        placeholder="(11) 98765-4321"
      />
    </AuthField>
  );
}
