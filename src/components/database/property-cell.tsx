"use client";

import { useRef, useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
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

/** Inline editor for a single database cell; the type drives the affordance. */
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
      return (
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className={cn(base, "bg-transparent outline-none [color-scheme:inherit]")}
        />
      );

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
