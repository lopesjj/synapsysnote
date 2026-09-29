"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((previous) => (Math.abs(previous - next) > 0.5 ? next : previous));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exponent);
  const fraction = raw / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

export function niceScale(maxValue: number, options: { count?: number; integer?: boolean } = {}): { max: number; ticks: number[] } {
  const count = options.count ?? 4;
  const safe = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : options.integer ? count : 1;
  let step = niceStep(safe / count);
  if (options.integer) step = Math.max(1, Math.ceil(step));
  const max = Math.max(step, Math.ceil(safe / step - 1e-9) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) ticks.push(Math.round(value * 1e6) / 1e6);
  return { max: ticks[ticks.length - 1], ticks };
}

export function ChartTooltip({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setBox((previous) => (previous.w === rect.width && previous.h === rect.height ? previous : { w: rect.width, h: rect.height }));
  }, [children]);
  const left = Math.min(Math.max(4, x - box.w / 2), Math.max(4, width - box.w - 4));
  const top = Math.max(0, y - box.h - 10);
  return (
    <div
      ref={ref}
      role="status"
      className="pointer-events-none absolute z-20 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11.5px] leading-snug text-ink shadow-[var(--shadow-float)]"
      style={{ left, top }}
    >
      {children}
    </div>
  );
}

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  tooltip: ReactNode;
  emphasis?: boolean;
}

export function ColumnChart({
  data,
  height = 180,
  formatTick,
  ariaLabel,
  emptyLabel,
  labelEvery = 1,
  integer = false,
}: {
  data: ColumnDatum[];
  height?: number;
  formatTick: (value: number) => string;
  ariaLabel: string;
  emptyLabel?: string;
  labelEvery?: number;
  integer?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const axisWidth = 40;
  const bottom = 22;
  const top = 8;
  const plotWidth = Math.max(0, width - axisWidth);
  const plotHeight = height - bottom - top;
  const { max, ticks } = niceScale(Math.max(...data.map((entry) => entry.value), 0), { integer });
  const band = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.min(24, Math.max(3, band * 0.56));
  const allZero = data.every((entry) => entry.value === 0);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((tick) => {
            const y = top + plotHeight - (tick / max) * plotHeight;
            return (
              <g key={tick}>
                <line x1={axisWidth} x2={width} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={axisWidth - 8} y={y} dy="0.32em" textAnchor="end" className="fill-[var(--text-faint)] text-[10px] tabular-nums">
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}
          {data.map((entry, index) => {
            const x = axisWidth + band * index + band / 2;
            const h = max ? (entry.value / max) * plotHeight : 0;
            const y = top + plotHeight - h;
            const radius = Math.min(4, barWidth / 2, h);
            const active = hover === index;
            return (
              <g key={entry.key}>
                {h > 0 ? (
                  <path
                    d={`M${x - barWidth / 2},${top + plotHeight} V${y + radius} Q${x - barWidth / 2},${y} ${x - barWidth / 2 + radius},${y} H${x + barWidth / 2 - radius} Q${x + barWidth / 2},${y} ${x + barWidth / 2},${y + radius} V${top + plotHeight} Z`}
                    fill="var(--accent)"
                    opacity={hover === null || active ? (entry.emphasis === false ? 0.55 : 1) : 0.45}
                  />
                ) : null}
                {index % labelEvery === 0 || data.length <= 8 ? (
                  <text
                    x={x}
                    y={height - 6}
                    textAnchor="middle"
                    className={cn("text-[10.5px]", entry.emphasis ? "fill-[var(--text)] font-medium" : "fill-[var(--text-faint)]")}
                  >
                    {entry.label}
                  </text>
                ) : null}
                <rect
                  x={axisWidth + band * index}
                  y={top}
                  width={band}
                  height={plotHeight + bottom}
                  fill="transparent"
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover((current) => (current === index ? null : current))}
                />
              </g>
            );
          })}
          <line
            x1={axisWidth}
            x2={width}
            y1={top + plotHeight}
            y2={top + plotHeight}
            stroke="var(--border-strong)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        </svg>
      ) : null}
      {allZero && emptyLabel ? (
        <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-[12px] text-faint">{emptyLabel}</p>
      ) : null}
      {hover !== null && data[hover] && width > 0 ? (
        <ChartTooltip
          x={axisWidth + band * hover + band / 2}
          y={top + plotHeight - (max ? (data[hover].value / max) * plotHeight : 0)}
          width={width}
        >
          {data[hover].tooltip}
        </ChartTooltip>
      ) : null}
    </div>
  );
}

export interface LineDatum {
  key: string;
  label: string;
  value: number | null;
  tooltip: ReactNode;
}

export function LineChart({
  data,
  height = 160,
  domainMax,
  formatTick,
  ariaLabel,
  labelEvery = 1,
  emptyLabel,
  integer = false,
}: {
  data: LineDatum[];
  height?: number;
  domainMax?: number;
  formatTick: (value: number) => string;
  ariaLabel: string;
  labelEvery?: number;
  emptyLabel?: string;
  integer?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const axisWidth = 40;
  const bottom = 22;
  const top = 10;
  const plotWidth = Math.max(0, width - axisWidth - 8);
  const plotHeight = height - bottom - top;
  const values = data.map((entry) => entry.value).filter((value): value is number => value !== null);
  const scale = domainMax ? { max: domainMax, ticks: [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * domainMax) } : niceScale(Math.max(...values, 0), { integer });
  const max = scale.max;
  const ticks = scale.ticks;
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const xOf = (index: number) => axisWidth + (data.length > 1 ? step * index : plotWidth / 2);
  const yOf = (value: number) => top + plotHeight - ((value - min) / span) * plotHeight;

  const segments: string[] = [];
  let pending = "";
  data.forEach((entry, index) => {
    if (entry.value === null) {
      if (pending) segments.push(pending);
      pending = "";
      return;
    }
    pending += `${pending ? "L" : "M"}${xOf(index)},${yOf(entry.value)} `;
  });
  if (pending) segments.push(pending);

  const findNearest = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left - axisWidth;
    if (data.length <= 1) return 0;
    return Math.max(0, Math.min(data.length - 1, Math.round(x / step)));
  };

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="block overflow-visible"
          onPointerMove={(event) => setHover(findNearest(event.clientX, event.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={axisWidth} x2={width} y1={yOf(tick)} y2={yOf(tick)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={axisWidth - 8} y={yOf(tick)} dy="0.32em" textAnchor="end" className="fill-[var(--text-faint)] text-[10px] tabular-nums">
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {hover !== null ? (
            <line x1={xOf(hover)} x2={xOf(hover)} y1={top} y2={top + plotHeight} stroke="var(--border-strong)" strokeWidth={1} />
          ) : null}
          {segments.map((d, index) => (
            <path key={index} d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {data.map((entry, index) =>
            entry.value === null ? null : (
              <circle
                key={entry.key}
                cx={xOf(index)}
                cy={yOf(entry.value)}
                r={hover === index ? 5 : 4}
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            )
          )}
          {data.map((entry, index) =>
            index % labelEvery === 0 ? (
              <text key={`l-${entry.key}`} x={xOf(index)} y={height - 6} textAnchor="middle" className="fill-[var(--text-faint)] text-[10.5px]">
                {entry.label}
              </text>
            ) : null
          )}
        </svg>
      ) : null}
      {!values.length && emptyLabel ? (
        <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-[12px] text-faint">{emptyLabel}</p>
      ) : null}
      {hover !== null && data[hover] && width > 0 ? (
        <ChartTooltip x={xOf(hover)} y={data[hover].value === null ? top + plotHeight / 2 : yOf(data[hover].value as number)} width={width}>
          {data[hover].tooltip}
        </ChartTooltip>
      ) : null}
    </div>
  );
}

export interface BarRow {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  color?: string;
  detail?: string;
  tone?: string;
}

export function BarList({
  rows,
  max,
  emptyLabel,
  className,
}: {
  rows: BarRow[];
  max?: number;
  emptyLabel?: string;
  className?: string;
}) {
  const top = max ?? Math.max(...rows.map((row) => row.value), 0);
  if (!rows.length) {
    return emptyLabel ? <p className="py-6 text-center text-[12px] text-faint">{emptyLabel}</p> : null;
  }
  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((row) => {
        const ratio = top > 0 ? Math.max(0, Math.min(1, row.value / top)) : 0;
        return (
          <li key={row.id} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3 max-sm:grid-cols-[minmax(0,1fr)_auto]">
            <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink max-sm:col-span-2">
              {row.color ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden /> : null}
              <span className="truncate" title={row.label}>{row.label}</span>
              {row.detail ? <span className="shrink-0 text-[11px] text-faint sm:hidden">{row.detail}</span> : null}
            </span>
            <span className="relative block h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${ratio * 100}%`, backgroundColor: row.tone ?? "var(--accent)" }}
              />
            </span>
            <span className="min-w-[4.5rem] text-right text-[12px] tabular-nums text-muted">
              {row.valueLabel}
              {row.detail ? <span className="ml-1.5 text-faint max-sm:hidden">{row.detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  color: string;
  valueLabel: string;
}

export function Donut({
  segments,
  size = 148,
  thickness = 16,
  center,
  ariaLabel,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = size / 2 - thickness / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = segments.length > 1 ? 2.5 : 0;
  let offset = 0;
  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-5 @md:flex-row @md:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={ariaLabel} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
          {total > 0
            ? segments.map((segment) => {
                const length = (segment.value / total) * circumference;
                const dash = Math.max(0, length - gap);
                const element = (
                  <circle
                    key={segment.id}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={hover === segment.id ? thickness + 3 : thickness}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                    opacity={hover && hover !== segment.id ? 0.4 : 1}
                    onPointerEnter={() => setHover(segment.id)}
                    onPointerLeave={() => setHover(null)}
                  />
                );
                offset += length;
                return element;
              })
            : null}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {hover ? (
            <>
              <span className="text-[15px] font-semibold text-ink">{segments.find((segment) => segment.id === hover)?.valueLabel}</span>
              <span className="max-w-[80%] truncate text-[11px] text-muted">{segments.find((segment) => segment.id === hover)?.label}</span>
            </>
          ) : (
            center
          )}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {segments.map((segment) => (
          <li
            key={segment.id}
            className={cn("flex items-center gap-2 text-[12px] transition-opacity", hover && hover !== segment.id && "opacity-50")}
            onPointerEnter={() => setHover(segment.id)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink" title={segment.label}>{segment.label}</span>
            <span className="tabular-nums text-muted">{segment.valueLabel}</span>
            <span className="w-9 text-right tabular-nums text-faint">
              {total ? `${Math.round((segment.value / total) * 100)}%` : "0%"}
            </span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

export interface HeatCell {
  key: string;
  level: 0 | 1 | 2 | 3 | 4;
  status: "studied" | "missed" | "rest" | "pending" | "before" | "future";
  tooltip: ReactNode;
}

export const HEAT_MISSED = "color-mix(in oklab, var(--danger) 78%, var(--surface))";
export const HEAT_REST = "color-mix(in oklab, var(--surface-2) 45%, transparent)";

export function heatColor(cell: Pick<HeatCell, "level" | "status">): string {
  if (cell.status === "studied" && cell.level) return `var(--heat-${cell.level})`;
  if (cell.status === "missed") return HEAT_MISSED;
  if (cell.status === "rest") return HEAT_REST;
  return "var(--surface-2)";
}

export function heatWeeks(width: number, labelWidth: number, gap: number, target = 15): number {
  if (!width) return 26;
  return Math.max(12, Math.min(53, Math.floor((width - labelWidth + gap) / (target + gap))));
}

export function Heatmap({
  weeks,
  rowLabels,
  columnLabels,
  ariaLabel,
  labelWidth = 30,
  gap = 4,
}: {
  weeks: HeatCell[][];
  rowLabels: string[];
  columnLabels: { index: number; label: string }[];
  ariaLabel: string;
  labelWidth?: number;
  gap?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ week: number; day: number } | null>(null);
  const available = Math.max(0, width - labelWidth);
  const cell = weeks.length ? Math.max(9, Math.min(22, (available - (weeks.length - 1) * gap) / weeks.length)) : 12;
  const radius = Math.max(2.5, cell * 0.28);
  const headerHeight = 18;

  return (
    <div ref={ref} className="relative w-full" role="img" aria-label={ariaLabel}>
      <div className="relative" style={{ height: headerHeight, marginLeft: labelWidth }}>
        {columnLabels.map((column) => (
          <span
            key={`${column.index}-${column.label}`}
            className="absolute top-0 text-[11px] capitalize text-faint"
            style={{ left: column.index * (cell + gap) }}
          >
            {column.label}
          </span>
        ))}
      </div>
      <div className="flex">
        <div className="flex shrink-0 flex-col" style={{ width: labelWidth, gap }}>
          {rowLabels.map((label, index) => (
            <span key={index} className="flex items-center text-[10.5px] capitalize text-faint" style={{ height: cell }}>
              {label}
            </span>
          ))}
        </div>
        <div className="flex" style={{ gap }}>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col" style={{ gap }}>
              {week.map((day, dayIndex) => {
                const active = hover?.week === weekIndex && hover.day === dayIndex;
                return (
                  <span
                    key={day.key}
                    onPointerEnter={() => (day.status === "future" ? undefined : setHover({ week: weekIndex, day: dayIndex }))}
                    onPointerLeave={() => setHover(null)}
                    className={cn("block transition-transform duration-150", day.status === "future" && "invisible", active && "scale-[1.18]")}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: radius,
                      backgroundColor: heatColor(day),
                      boxShadow:
                        day.status === "pending"
                          ? "inset 0 0 0 1.5px var(--accent)"
                          : active
                            ? "0 0 0 2px var(--surface), 0 0 0 3.5px var(--text-muted)"
                            : undefined,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {hover ? (
        <ChartTooltip x={labelWidth + hover.week * (cell + gap) + cell / 2} y={headerHeight + hover.day * (cell + gap)} width={width}>
          {weeks[hover.week]?.[hover.day]?.tooltip}
        </ChartTooltip>
      ) : null}
    </div>
  );
}

export function Meter({
  value,
  max,
  tone = "var(--accent)",
  className,
  label,
}: {
  value: number;
  max: number;
  tone?: string;
  className?: string;
  label?: string;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-label={label}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]", className)}
    >
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${ratio * 100}%`, backgroundColor: tone }} />
    </div>
  );
}

export function Sparkbars({ values, highlightLast = true, className }: { values: number[]; highlightLast?: boolean; className?: string }) {
  const max = Math.max(...values, 0);
  return (
    <div className={cn("flex h-6 items-end gap-[3px]", className)} aria-hidden>
      {values.map((value, index) => {
        const ratio = max > 0 ? value / max : 0;
        const last = highlightLast && index === values.length - 1;
        return (
          <span
            key={index}
            className="block w-[5px] rounded-[2px]"
            style={{
              height: value > 0 ? `${Math.max(12, ratio * 100)}%` : "2px",
              backgroundColor: value > 0 ? (last ? "var(--accent)" : "color-mix(in oklab, var(--accent) 38%, var(--surface-2))") : "var(--border)",
            }}
          />
        );
      })}
    </div>
  );
}
