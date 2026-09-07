"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Check, Link as LinkIcon } from "lucide-react";
import type { PropertyDef, PropertyValue } from "@/types/models";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { cn, hashHue } from "@/lib/utils";

export function SelectChip({ value, color }: { value: string; color?: string }) {
  const hue = hashHue(value);
  const background = color
    ? `color-mix(in oklab, ${color} 18%, transparent)`
    : `hsl(${hue} 70% 50% / 0.16)`;
  const text = color ?? `hsl(${hue} 70% 62%)`;
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background, color: text }}
    >
      {value}
    </span>
  );
}

function applyDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatIsoToDisplay(iso: unknown): string {
  if (!iso || typeof iso !== "string") return "";
  const clean = iso.trim();
  if (!clean) return "";

  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    return clean;
  }

  return clean;
}

function parseDisplayDateToIso(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function DateCell({
  value,
  onChange,
  base,
}: {
  value: PropertyValue;
  onChange: (next: PropertyValue) => void;
  base: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatIsoToDisplay(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(formatIsoToDisplay(value));
    }
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const parsedIso = parseDisplayDateToIso(draft);
    if (!draft.trim()) {
      onChange(null);
    } else if (parsedIso) {
      onChange(parsedIso);
      setDraft(formatIsoToDisplay(parsedIso));
    } else {
      setDraft(formatIsoToDisplay(value));
    }
  };

  const isoForPicker =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? value.slice(0, 10)
      : "";

  if (editing) {
    return (
      <div className={cn(base, "relative flex items-center gap-1 p-0.5 ring-1 ring-[var(--accent)] rounded-[4px] bg-[var(--surface-primary)]")}>
        <input
          ref={inputRef}
          type="text"
          placeholder="DD/MM/AAAA"
          value={draft}
          onChange={(e) => setDraft(applyDateMask(e.target.value))}
          onBlur={(e) => {
            if (e.relatedTarget && (e.relatedTarget as HTMLElement).dataset?.datepicker) {
              return;
            }
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
            } else if (e.key === "Escape") {
              setEditing(false);
              setDraft(formatIsoToDisplay(value));
            }
          }}
          className="w-full bg-transparent px-1.5 py-0.5 text-[12.5px] text-ink outline-none tabular-nums font-mono"
        />
        <button
          type="button"
          data-datepicker="true"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            try {
              datePickerRef.current?.showPicker();
            } catch {
              datePickerRef.current?.focus();
            }
          }}
          className="shrink-0 p-1 text-faint hover:text-ink transition rounded"
          title="Abrir calendário"
        >
          <Calendar className="size-3.5" />
        </button>
        <input
          ref={datePickerRef}
          type="date"
          tabIndex={-1}
          value={isoForPicker}
          onChange={(e) => {
            const nextIso = e.target.value;
            if (nextIso) {
              setDraft(formatIsoToDisplay(nextIso));
              onChange(nextIso);
              setEditing(false);
            }
          }}
          className="sr-only pointer-events-none"
        />
      </div>
    );
  }

  const display = formatIsoToDisplay(value);

  return (
    <div className={cn(base, "flex items-center justify-between group/date p-0.5")}>
      <button
        type="button"
        onClick={() => {
          setDraft(formatIsoToDisplay(value));
          setEditing(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex-1 text-left px-1.5 py-0.5"
      >
        {display ? (
          <span className="tabular-nums font-mono text-[12.5px]">{display}</span>
        ) : (
          <span className="text-faint">-</span>
        )}
      </button>
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          try {
            datePickerRef.current?.showPicker();
          } catch {
            setEditing(true);
          }
        }}
        className="p-1 text-faint hover:text-ink opacity-40 group-hover/date:opacity-100 transition-opacity rounded"
        title="Abrir calendário"
      >
        <Calendar className="size-3.5" />
      </button>
      <input
        ref={datePickerRef}
        type="date"
        tabIndex={-1}
        value={isoForPicker}
        onChange={(e) => {
          const nextIso = e.target.value;
          if (nextIso) {
            setDraft(formatIsoToDisplay(nextIso));
            onChange(nextIso);
          }
        }}
        className="sr-only pointer-events-none"
      />
    </div>
  );
}

export function PropertyCell({
  property,
  value,
  onChange,
  compact,
}: {
  property: PropertyDef;
  value: PropertyValue;
  onChange: (next: PropertyValue) => void;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const beginEdit = () => {
    setDraft(String(value ?? ""));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commit = () => {
    setEditing(false);
    if (property.type === "number") {
      const parsed = Number(draft.replace(",", "."));
      onChange(Number.isFinite(parsed) ? parsed : null);
      return;
    }
    onChange(draft);
  };

  const base = cn(
    "w-full truncate text-[12.5px] text-ink",
    compact ? "px-1 py-0.5" : "px-2 py-1.5"
  );

  switch (property.type) {
    case "checkbox":
      return (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={cn(base, "flex items-center")}
          aria-label={property.name}
        >
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-[4px] border transition",
              value
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border-strong)]"
            )}
          >
            {value ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        </button>
      );

    case "select":
      return (
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className={cn(base, "text-left")}>
              {value ? (
                <SelectChip
                  value={String(value)}
                  color={property.options?.find((o) => o.name === value)?.color}
                />
              ) : (
                <span className="text-faint">-</span>
              )}
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            {property.options?.map((option) => (
              <MenuItem key={option.id} onSelect={() => onChange(option.name)}>
                <SelectChip value={option.name} color={option.color} />
              </MenuItem>
            ))}
            <MenuItem onSelect={() => onChange(null)}>
              <span className="text-faint">Limpar</span>
            </MenuItem>
          </MenuContent>
        </Menu>
      );

    case "multi_select": {
      const values = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className={cn(base, "flex flex-wrap gap-1 text-left")}>
              {values.length ? (
                values.map((item) => (
                  <SelectChip
                    key={item}
                    value={item}
                    color={property.options?.find((o) => o.name === item)?.color}
                  />
                ))
              ) : (
                <span className="text-faint">-</span>
              )}
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            {property.options?.map((option) => {
              const active = values.includes(option.name);
              return (
                <MenuItem
                  key={option.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    onChange(
                      active ? values.filter((v) => v !== option.name) : [...values, option.name]
                    );
                  }}
                >
                  <span className={cn("flex-1", !active && "opacity-60")}>
                    <SelectChip value={option.name} color={option.color} />
                  </span>
                  {active ? <Check className="size-3" /> : null}
                </MenuItem>
              );
            })}
          </MenuContent>
        </Menu>
      );
    }

    case "date":
      return <DateCell value={value} onChange={onChange} base={base} />;

    case "url":
      return editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && commit()}
          className={cn(base, "bg-transparent outline-none")}
        />
      ) : (
        <button type="button" onClick={beginEdit} className={cn(base, "text-left")}>
          {value ? (
            <span className="inline-flex items-center gap-1 text-[var(--accent)]">
              <LinkIcon className="size-3" />
              {String(value)}
            </span>
          ) : (
            <span className="text-faint">-</span>
          )}
        </button>
      );

    default:
      return editing ? (
        <input
          ref={inputRef}
          value={draft}
          inputMode={property.type === "number" ? "decimal" : "text"}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setEditing(false);
          }}
          className={cn(base, "bg-transparent outline-none ring-1 ring-[var(--accent)] rounded-[4px]")}
        />
      ) : (
        <button
          type="button"
          onClick={beginEdit}
          className={cn(
            base,
            "text-left",
            property.type === "title" && "font-medium",
            property.type === "number" && "text-right font-mono tabular-nums"
          )}
        >
          {value === null || value === undefined || value === "" ? (
            <span className="text-faint">-</span>
          ) : (
            String(value)
          )}
        </button>
      );
  }
}
