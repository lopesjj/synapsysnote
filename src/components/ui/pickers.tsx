"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/translations";
import { HTML_LANG } from "@/lib/i18n/locale";
import type { SupportedLanguage } from "@/types/models";
import type { DayKey } from "@/types/study";
import {
  addDays,
  addMonths,
  formatDay,
  isDayKey,
  monthLabel,
  startOfMonth,
  weekdayLabel,
  weekdayOf,
} from "@/lib/study/dates";

const POPOVER = "z-[160] w-auto p-0";

function localeOf(language: string): string {
  return HTML_LANG[language as SupportedLanguage] ?? "pt-BR";
}

function localToday(): DayKey {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function weekStartsOn(locale: string): number {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
      getWeekInfo?: () => { firstDay?: number };
    };
    const first = info.weekInfo?.firstDay ?? info.getWeekInfo?.().firstDay;
    if (typeof first === "number") return first % 7;
  } catch {
    return 0;
  }
  return 0;
}

function monthCells(month: DayKey, start: number): DayKey[] {
  const first = startOfMonth(month);
  const offset = (weekdayOf(first) - start + 7) % 7;
  const origin = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(origin, index));
}

function inRange(day: string, min?: string, max?: string): boolean {
  if (min && day < min) return false;
  if (max && day > max) return false;
  return true;
}

function capitalize(value: string, locale: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
    >
      {children}
    </button>
  );
}

function DateCalendar({
  value,
  onChange,
  min,
  max,
  clearable,
  onDone,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  clearable?: boolean;
  onDone: () => void;
}) {
  const { t, language, textDir } = useTranslation();
  const locale = localeOf(language);
  const start = useMemo(() => weekStartsOn(locale), [locale]);
  const today = localToday();
  const selected = isDayKey(value) ? value : "";
  const [cursor, setCursor] = useState<DayKey>(() => startOfMonth(selected || today));
  const [view, setView] = useState<"days" | "months">("days");
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => (index + start) % 7),
    [start]
  );
  const days = useMemo(() => monthCells(cursor, start), [cursor, start]);
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, index) => `${cursor.slice(0, 4)}-${String(index + 1).padStart(2, "0")}-01` as DayKey),
    [cursor]
  );
  const todayOk = inRange(today, min, max);

  return (
    <div dir={textDir} className="w-[17.25rem] max-w-[calc(100vw-2rem)] p-3">
      <div className="flex items-center justify-between gap-2">
        <NavButton
          label={view === "months" ? String(Number(cursor.slice(0, 4)) - 1) : capitalize(monthLabel(addMonths(cursor, -1), locale), locale)}
          onClick={() => setCursor((month) => addMonths(month, view === "months" ? -12 : -1))}
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </NavButton>
        <button
          type="button"
          onClick={() => setView((current) => (current === "days" ? "months" : "days"))}
          className="min-w-0 flex-1 truncate rounded-[8px] px-2 py-1 text-[13px] font-semibold tracking-[-0.01em] text-ink transition hover:bg-[var(--surface-hover)]"
        >
          {capitalize(view === "months" ? cursor.slice(0, 4) : monthLabel(cursor, locale), locale)}
        </button>
        <NavButton
          label={view === "months" ? String(Number(cursor.slice(0, 4)) + 1) : capitalize(monthLabel(addMonths(cursor, 1), locale), locale)}
          onClick={() => setCursor((month) => addMonths(month, view === "months" ? 12 : 1))}
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </NavButton>
      </div>

      {view === "months" ? (
        <div className="mt-3 grid grid-cols-3 gap-1">
          {months.map((month) => {
            const active = selected.startsWith(month.slice(0, 7));
            return (
              <button
                key={month}
                type="button"
                onClick={() => {
                  setCursor(month);
                  setView("days");
                }}
                className={cn(
                  "h-9 rounded-[8px] text-[12.5px] transition",
                  active ? "bg-[var(--accent)] font-medium text-[var(--accent-contrast)]" : "text-ink hover:bg-[var(--surface-hover)]"
                )}
              >
                {capitalize(formatDay(month, locale, { month: "short" }).replace(".", ""), locale)}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-7">
            {weekdays.map((weekday) => (
              <span key={weekday} className="pb-1 text-center text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
                {capitalize(weekdayLabel(weekday, locale, "narrow"), locale)}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((day) => {
              const outside = day.slice(0, 7) !== cursor.slice(0, 7);
              const active = day === selected;
              const isToday = day === today;
              const enabled = inRange(day, min, max);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!enabled}
                  onClick={() => {
                    onChange(day);
                    onDone();
                  }}
                  className={cn(
                    "mx-auto flex size-8 items-center justify-center rounded-[9px] text-[12.5px] tabular-nums transition",
                    active
                      ? "bg-[var(--accent)] font-semibold text-[var(--accent-contrast)]"
                      : isToday
                        ? "font-semibold text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent)]"
                        : outside
                          ? "text-faint hover:bg-[var(--surface-hover)] hover:text-ink"
                          : "text-ink hover:bg-[var(--surface-hover)]",
                    !enabled && "pointer-events-none opacity-30"
                  )}
                >
                  {Number(day.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2">
        {clearable ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              onDone();
            }}
            className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            {t("clear")}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={!todayOk}
          onClick={() => {
            onChange(today);
            onDone();
          }}
          className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:pointer-events-none disabled:opacity-40"
        >
          {t("today_short")}
        </button>
      </div>
    </div>
  );
}

export function DatePopover({
  value,
  onChange,
  min,
  max,
  clearable,
  open,
  onOpenChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  clearable?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [inner, setInner] = useState(false);
  const shown = open ?? inner;
  const setShown = (next: boolean) => {
    onOpenChange?.(next);
    if (open === undefined) setInner(next);
  };
  return (
    <Popover open={shown} onOpenChange={setShown}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} collisionPadding={12} className={POPOVER}>
        <DateCalendar
          key={shown ? value || "empty" : "closed"}
          value={value}
          min={min}
          max={max}
          clearable={clearable}
          onChange={onChange}
          onDone={() => setShown(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export function DateField({
  id,
  value,
  onChange,
  min,
  max,
  clearable,
  disabled,
  className,
  variant = "field",
  placeholder,
  autoFocus,
  open,
  onOpenChange,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: "field" | "ghost";
  placeholder?: string;
  autoFocus?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  "aria-label"?: string;
}) {
  const { language } = useTranslation();
  const locale = localeOf(language);
  const label = isDayKey(value) ? formatDay(value, locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  return (
    <DatePopover value={value} onChange={onChange} min={min} max={max} clearable={clearable} open={open} onOpenChange={onOpenChange}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={cn(
          variant === "ghost"
            ? "inline-flex h-8 min-w-0 max-w-full items-center justify-end gap-2 rounded-[8px] bg-transparent px-2 text-[13px] tabular-nums text-ink outline-none transition hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
            : "inline-flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-left text-[13px] text-ink outline-none transition hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]",
          disabled && "pointer-events-none opacity-50",
          className
        )}
      >
        <span className={cn("min-w-0 truncate tabular-nums", !label && "text-faint")}>{label || placeholder || "-"}</span>
        <CalendarDays className="size-3.5 shrink-0 text-faint" />
      </button>
    </DatePopover>
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function Wheel({
  values,
  selected,
  onSelect,
}: {
  values: number[];
  selected: number | null;
  onSelect: (value: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>("[data-on='true']");
    if (!list || !current) return;
    list.scrollTop = current.offsetTop - list.clientHeight / 2 + current.clientHeight / 2;
  }, [selected]);
  return (
    <div ref={listRef} className="relative h-[11.25rem] overflow-y-auto overscroll-contain px-1 py-1 [scrollbar-width:thin]">
      {values.map((value) => {
        const on = value === selected;
        return (
          <button
            key={value}
            type="button"
            data-on={on}
            onClick={() => onSelect(value)}
            className={cn(
              "flex h-8 w-full items-center justify-center rounded-[8px] text-[13px] tabular-nums transition",
              on ? "bg-[var(--accent)] font-semibold text-[var(--accent-contrast)]" : "text-ink hover:bg-[var(--surface-hover)]"
            )}
          >
            {pad(value)}
          </button>
        );
      })}
    </div>
  );
}

export function TimeField({
  id,
  value,
  onChange,
  clearable,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const { t, textDir } = useTranslation();
  const parsed = parseTime(value);
  const [open, setOpen] = useState(false);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, index) => index), []);
  const pick = (hour: number, minute: number) => onChange(`${pad(hour)}:${pad(minute)}`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12.5px] font-medium tabular-nums text-ink outline-none transition hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]",
            !parsed && "text-faint",
            disabled && "pointer-events-none opacity-50",
            className
          )}
        >
          {parsed ? `${pad(parsed.hour)}:${pad(parsed.minute)}` : "--:--"}
          <Clock3 className="size-3.5 text-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} collisionPadding={12} className={cn(POPOVER, "w-[9.5rem]")}>
        <div dir={textDir} className="grid grid-cols-2 divide-x divide-[var(--border)]">
          <Wheel
            values={hours}
            selected={parsed?.hour ?? null}
            onSelect={(hour) => pick(hour, parsed?.minute ?? 0)}
          />
          <Wheel
            values={minutes}
            selected={parsed?.minute ?? null}
            onSelect={(minute) => pick(parsed?.hour ?? new Date().getHours(), minute)}
          />
        </div>
        {clearable ? (
          <div className="border-t border-[var(--border)] p-1.5">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex h-7 w-full items-center justify-center rounded-[8px] text-[12px] font-medium text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              {t("clear")}
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
