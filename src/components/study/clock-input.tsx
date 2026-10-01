"use client";

import { useLayoutEffect, useRef } from "react";
import { Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { clockLabel, maskClock, parseDurationInput } from "@/lib/study/format";

/** Posição logo depois do n-ésimo dígito do texto. */
function caretAfterDigits(text: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] >= "0" && text[index] <= "9") {
      seen += 1;
      if (seen === digits) return index + 1;
    }
  }
  return text.length;
}

/**
 * Campo de duração HH:MM:SS com máscara: os dois-pontos entram sozinhos
 * enquanto se digita (o teclado numérico do celular nem tem ":"). Ao sair do
 * campo o valor é completado, e ao entrar ele fica selecionado para ser trocado.
 */
export function ClockInput({
  value,
  onChange,
  ariaLabel,
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  // O clique que dá foco não pode desfazer a seleção feita no foco.
  const keepSelection = useRef(false);

  useLayoutEffect(() => {
    const input = ref.current;
    if (caret.current === null || !input || document.activeElement !== input) return;
    input.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  return (
    <Input
      ref={ref}
      id={id}
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      value={value}
      placeholder="00:00:00"
      onFocus={(event) => {
        event.currentTarget.select();
        keepSelection.current = true;
      }}
      onMouseUp={(event) => {
        if (!keepSelection.current) return;
        keepSelection.current = false;
        event.preventDefault();
      }}
      onKeyDown={() => {
        keepSelection.current = false;
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        const raw = input.value;
        const inputType = (event.nativeEvent as InputEvent).inputType ?? "";
        const masked = maskClock(raw, inputType.startsWith("delete"));
        const position = input.selectionStart ?? raw.length;
        caret.current =
          masked === value ? null : position >= raw.length ? masked.length : caretAfterDigits(masked, raw.slice(0, position).replace(/\D/g, "").length);
        onChange(masked);
      }}
      onBlur={() => {
        keepSelection.current = false;
        const seconds = parseDurationInput(value);
        if (seconds !== null && value.trim()) onChange(clockLabel(seconds, true));
      }}
      className={cn("font-mono tabular-nums", className)}
    />
  );
}
