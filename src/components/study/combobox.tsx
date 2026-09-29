"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboOption {
  id: string;
  label: string;
  detail?: string;
  hint?: ReactNode;
  leading?: ReactNode;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function Combobox({
  options,
  value,
  pendingLabel,
  onSelect,
  onCreate,
  createLabel,
  placeholder,
  disabled,
  ariaLabel,
  clearable,
  onClear,
  emptyLabel,
  autoFocus,
}: {
  options: ComboOption[];
  value: string | null;
  pendingLabel?: string | null;
  onSelect: (id: string) => void;
  onCreate?: (label: string) => void;
  createLabel?: (label: string) => string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  clearable?: boolean;
  onClear?: () => void;
  emptyLabel?: string;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const selected = options.find((option) => option.id === value) ?? null;
  const display = selected?.label ?? pendingLabel ?? "";

  const filtered = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return options;
    return options.filter((option) => {
      const haystack = normalize(`${option.label} ${option.detail ?? ""}`);
      return tokens.every((token) => haystack.includes(token));
    });
  }, [options, query]);

  const trimmed = query.trim();
  const exact = options.some((option) => normalize(option.label) === normalize(trimmed));
  const canCreate = Boolean(onCreate && trimmed && !exact);
  const total = filtered.length + (canCreate ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const choose = (index: number) => {
    if (index < filtered.length) {
      onSelect(filtered[index].id);
    } else if (canCreate && onCreate) {
      onCreate(trimmed);
    }
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 transition",
          open && "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]",
          disabled && "pointer-events-none opacity-50"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {selected?.leading && !open ? <span className="shrink-0">{selected.leading}</span> : null}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          disabled={disabled}
          value={open ? query : display}
          placeholder={open && display ? display : placeholder}
          onFocus={() => {
            setOpen(true);
            setCursor(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setCursor((current) => Math.min(total - 1, current + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter") {
              if (open && total > 0) {
                event.preventDefault();
                choose(Math.min(cursor, total - 1));
              }
            } else if (event.key === "Escape") {
              if (open) {
                event.stopPropagation();
                event.preventDefault();
                setOpen(false);
                setQuery("");
              }
            } else if (event.key === "Tab") {
              setOpen(false);
              setQuery("");
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
        />
        {clearable && (value || pendingLabel) && !open ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClear?.();
            }}
            className="rounded p-0.5 text-faint hover:text-ink"
            aria-label={ariaLabel}
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-faint" />
        )}
      </div>
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[120] max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-float)]"
        >
          {filtered.map((option, index) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              onPointerEnter={() => setCursor(index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[12.5px] text-ink",
                cursor === index && "bg-[var(--surface-hover)]"
              )}
            >
              {option.leading ? <span className="shrink-0">{option.leading}</span> : null}
              {option.detail ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  <span className="block truncate text-[11px] text-faint">{option.detail}</span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              )}
              {option.hint ? <span className="shrink-0 text-[11px] text-faint">{option.hint}</span> : null}
              {option.id === value ? <Check className="size-3.5 shrink-0 text-[var(--accent)]" /> : null}
            </button>
          ))}
          {canCreate ? (
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(filtered.length)}
              onPointerEnter={() => setCursor(filtered.length)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[12.5px] font-medium text-[var(--accent)]",
                cursor === filtered.length && "bg-[var(--surface-hover)]"
              )}
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{createLabel ? createLabel(trimmed) : trimmed}</span>
            </button>
          ) : null}
          {!filtered.length && !canCreate ? (
            <p className="px-2 py-2 text-[12px] text-faint">{emptyLabel ?? "–"}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
