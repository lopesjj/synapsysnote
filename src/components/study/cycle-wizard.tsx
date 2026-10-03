"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, Copy, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/primitives";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { capitalizeFirst, orderedWeekdays, weekdayLabel } from "@/lib/study/dates";
import { cycleLength, generateCycleItems, subjectMinutes } from "@/lib/study/cycle";
import { weeklyAgendaMinutes } from "@/lib/study/agenda";
import { subjectTone } from "@/lib/study/defaults";
import type { CycleItem, CycleSubjectConfig } from "@/types/study";
import { GoalMark, Segmented, SubjectDot } from "./ui";

const BLOCK_OPTIONS = [15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120];
const BAR_MAX = 8 * 60;
const DAY_MAX = 16 * 60;
const BARE_SELECT =
  "h-8 cursor-pointer appearance-none rounded-[8px] bg-transparent pl-2 pr-7 text-[13px] tabular-nums text-ink outline-none transition [text-align-last:right] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]";

type Mode = "manual" | "auto";

function BareSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex">
      <select {...props} className={cn(BARE_SELECT, className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </span>
  );
}

/** Nível de 1 a 5 desenhado como régua: cada traço cheio é um ponto. */
function LevelRuler({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center">
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={value === level}
          aria-label={`${label} ${level}`}
          onClick={() => onChange(level)}
          className="group flex h-7 w-[18px] items-center justify-center"
        >
          <span
            className={cn(
              "block h-3.5 w-[5px] rounded-full transition",
              level <= value ? "bg-[var(--accent)]" : "bg-[var(--border-strong)] group-hover:bg-[color-mix(in_oklab,var(--accent)_45%,var(--border-strong))]"
            )}
          />
        </button>
      ))}
    </div>
  );
}

function DayBar({
  value,
  label,
  longLabel,
  onChange,
}: {
  value: number;
  label: string;
  longLabel: string;
  onChange: (value: number) => void;
}) {
  const { st, duration } = useStudyT();
  const track = useRef<HTMLDivElement>(null);
  const clamp = (minutes: number) => Math.max(0, Math.min(DAY_MAX, minutes));
  const fromPointer = (clientY: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || !rect.height) return;
    const ratio = 1 - (clientY - rect.top) / rect.height;
    onChange(clamp(Math.round((ratio * BAR_MAX) / 15) * 15));
  };
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span className={cn("h-8 text-center text-[11.5px] leading-tight tabular-nums", value ? "font-medium text-ink" : "text-faint")}>
        {value ? duration(value * 60) : st("day_free")}
      </span>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={longLabel}
        aria-valuemin={0}
        aria-valuemax={DAY_MAX}
        aria-valuenow={value}
        aria-valuetext={value ? duration(value * 60) : st("day_free")}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          fromPointer(event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event.clientY);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 60 : 15;
          if (event.key === "ArrowUp" || event.key === "ArrowRight") onChange(clamp(value + step));
          else if (event.key === "ArrowDown" || event.key === "ArrowLeft") onChange(clamp(value - step));
          else if (event.key === "Home") onChange(0);
          else return;
          event.preventDefault();
        }}
        className="relative h-40 w-full max-w-12 cursor-ns-resize touch-none overflow-hidden rounded-[14px] bg-[var(--surface-2)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span
          className="absolute inset-x-0 bottom-0 rounded-[14px] bg-[var(--accent)] transition-[height] duration-150 ease-out"
          style={{ height: `${Math.min(100, (value / BAR_MAX) * 100)}%` }}
        />
        {[120, 240, 360].map((mark) => (
          <span
            key={mark}
            aria-hidden
            className="pointer-events-none absolute inset-x-2.5 h-px bg-[color-mix(in_oklab,var(--text)_10%,transparent)]"
            style={{ bottom: `${(mark / BAR_MAX) * 100}%` }}
          />
        ))}
      </div>
      <div className="hidden items-center sm:flex">
        <button
          type="button"
          aria-label={`${longLabel} −15`}
          onClick={() => onChange(clamp(value - 15))}
          className="flex size-6 items-center justify-center rounded-full text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Minus className="size-3" />
        </button>
        <button
          type="button"
          aria-label={`${longLabel} +15`}
          onClick={() => onChange(clamp(value + 15))}
          className="flex size-6 items-center justify-center rounded-full text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Plus className="size-3" />
        </button>
      </div>
      <span className="text-[12px] font-medium text-muted">{label}</span>
    </div>
  );
}

function CyclePreview({ items, size = 128 }: { items: CycleItem[]; size?: number }) {
  const { subjectById } = useStudy();
  const thickness = 12;
  const radius = size / 2 - thickness / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const total = items.reduce((sum, item) => sum + item.minutes, 0);
  const gap = items.length > 1 ? Math.min(3, circumference / items.length / 4) : 0;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
      {total
        ? items.map((item) => {
            const length = (item.minutes / total) * circumference;
            const dash = Math.max(0.5, length - gap);
            const tone = subjectById(item.subjectId)?.color;
            const element = (
              <circle
                key={item.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={tone ? subjectTone(tone) : "var(--text-faint)"}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return element;
          })
        : null}
    </svg>
  );
}

export function CycleWizard({
  open,
  onOpenChange,
  initialMode = "manual",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: Mode;
}) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      {open ? <WizardBody initialMode={initialMode} onClose={() => onOpenChange(false)} /> : null}
    </DialogShell>
  );
}

function WizardBody({ initialMode, onClose }: { initialMode: Mode; onClose: () => void }) {
  const { st, locale, duration } = useStudyT();
  const router = useRouter();
  const { planSubjects, planCycle, settings, actions, activePlan, subjectById, today } = useStudy();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState(0);
  const [weekMinutes, setWeekMinutes] = useState<number[]>(() =>
    planCycle?.weekMinutes.some((value) => value > 0)
      ? [...planCycle.weekMinutes]
      : Array.from({ length: 7 }, (_, weekday) => (settings.studyWeekdays.includes(weekday) ? 120 : 0))
  );
  const [configs, setConfigs] = useState<(CycleSubjectConfig & { included: boolean })[]>(() =>
    planSubjects.map((subject) => {
      const existing = planCycle?.subjects.find((entry) => entry.subjectId === subject.id);
      return {
        subjectId: subject.id,
        weight: existing?.weight ?? 3,
        level: existing?.level ?? 3,
        included: planCycle?.subjects.length ? Boolean(existing) : true,
      };
    })
  );
  const [minBlock, setMinBlock] = useState(planCycle?.minBlock ?? 30);
  const [maxBlock, setMaxBlock] = useState(planCycle?.maxBlock ?? 60);
  const [manualBlocks, setManualBlocks] = useState<CycleItem[]>(() => {
    if (planCycle?.items.length) return planCycle.items.map((item) => ({ ...item }));
    return planSubjects.map((subject) => ({ id: nanoid(12), subjectId: subject.id, minutes: 50 }));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Os dias fixos da agenda já ocupam parte da semana; a rotação só divide o que sobra.
  const reserved = useMemo(() => (planCycle ? weeklyAgendaMinutes(planCycle.agenda, today) : 0), [planCycle, today]);
  const included = useMemo(() => configs.filter((config) => config.included), [configs]);
  const autoInput = useMemo(
    () => ({
      subjects: included.map(({ subjectId, weight, level }) => ({ subjectId, weight, level })),
      weekMinutes,
      minBlock: Math.min(minBlock, maxBlock),
      maxBlock: Math.max(minBlock, maxBlock),
      reservedMinutes: reserved,
    }),
    [included, maxBlock, minBlock, reserved, weekMinutes]
  );
  const shares = useMemo(() => subjectMinutes(autoInput), [autoInput]);
  const autoPreview = useMemo(() => generateCycleItems(autoInput, (index) => `preview-${index}`), [autoInput]);

  const blocks = mode === "manual" ? manualBlocks : autoPreview;
  const weekTotal = cycleLength({ weekMinutes });
  const freeTotal = Math.max(0, weekTotal - reserved);
  const cycleTotal = blocks.reduce((sum, item) => sum + item.minutes, 0);
  const rounds = cycleTotal > 0 && freeTotal > 0 ? (freeTotal / cycleTotal).toFixed(1) : "0";
  const shareSum = [...shares.values()].reduce((sum, value) => sum + value, 0);

  const steps = [st("wizard_step_time"), st("wizard_step_subjects"), st("wizard_step_review")];
  const title =
    step === 0
      ? st("wizard_time_desc")
      : step === 1
        ? mode === "manual"
          ? st("wizard_subjects_title_manual")
          : st("wizard_subjects_title_auto")
        : st("wizard_review_title");

  const setDay = (weekday: number, minutes: number) => {
    setError(null);
    setWeekMinutes((list) => list.map((value, index) => (index === weekday ? minutes : value)));
  };
  const updateConfig = (subjectId: string, patch: Partial<CycleSubjectConfig & { included: boolean }>) => {
    setError(null);
    setConfigs((list) => list.map((entry) => (entry.subjectId === subjectId ? { ...entry, ...patch } : entry)));
  };
  const addBlock = (subjectId: string) => {
    setError(null);
    setManualBlocks((list) => [...list, { id: nanoid(12), subjectId, minutes: 50 }]);
  };
  const moveBlock = (index: number, direction: -1 | 1) =>
    setManualBlocks((list) => {
      const target = index + direction;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  const validate = (target: number) => {
    if (target >= 1 && weekTotal <= 0) return st("wizard_need_time");
    if (target >= 2 && mode === "manual" && !manualBlocks.length) return st("cycle_blocks_empty");
    if (target >= 2 && mode === "auto" && (!included.length || !autoPreview.length)) return st("wizard_need_subjects");
    return null;
  };
  const goTo = (target: number) => {
    const problem = target > step ? validate(target) : null;
    setError(problem);
    if (!problem) setStep(target);
  };

  const save = async () => {
    const problem = validate(2);
    if (problem || !activePlan) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      if (mode === "manual") {
        const used = new Set(manualBlocks.map((block) => block.subjectId));
        await actions.saveCycle(activePlan.id, {
          subjects: configs.filter((config) => used.has(config.subjectId)).map(({ subjectId, weight, level }) => ({ subjectId, weight, level })),
          weekMinutes,
          minBlock: autoInput.minBlock,
          maxBlock: autoInput.maxBlock,
          items: manualBlocks,
        });
      } else {
        // Ids vazios: o backend cria ids novos, e o histórico da sequência anterior não se confunde com a nova.
        await actions.saveCycle(activePlan.id, {
          subjects: autoInput.subjects,
          weekMinutes,
          minBlock: autoInput.minBlock,
          maxBlock: autoInput.maxBlock,
          items: autoPreview.map((item) => ({ id: "", subjectId: item.subjectId, minutes: item.minutes })),
        });
      }
      toast.success(st("schedule_saved"));
      onClose();
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  const modeSwitch = (
    <Segmented<Mode>
      size="md"
      value={mode}
      onChange={(value) => {
        setError(null);
        setMode(value);
      }}
      options={[
        { value: "manual", label: st("cycle_mode_manual") },
        { value: "auto", label: st("cycle_mode_auto") },
      ]}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pb-4 pr-12 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12px]">
          {activePlan ? (
            <span className="flex min-w-0 items-center gap-1.5 text-muted">
              <GoalMark icon={activePlan.icon} name={activePlan.name} seed={activePlan.id} size={16} />
              <span className="truncate">{activePlan.name || st("untitled_goal")}</span>
            </span>
          ) : (
            <span />
          )}
          <nav aria-label={st("schedule_setup")} className="flex items-center gap-1.5">
            {steps.map((label, index) => (
              <span key={label} className="flex items-center gap-1.5">
                {index ? <span aria-hidden className="h-px w-3 bg-[var(--border-strong)]" /> : null}
                <button
                  type="button"
                  disabled={index > step}
                  aria-current={index === step ? "step" : undefined}
                  onClick={() => goTo(index)}
                  className={cn(
                    "transition",
                    index === step ? "font-medium text-ink" : index < step ? "text-muted hover:text-ink" : "text-faint"
                  )}
                >
                  {label}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <h2 className="mt-3 text-[21px] font-semibold leading-snug tracking-[-0.02em] text-ink">{title}</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
        {step === 0 ? (
          <div>
            <div className="-mx-2 overflow-x-auto px-2 pb-2 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
              <div className="grid min-w-[21rem] grid-cols-7 gap-1.5 sm:min-w-0 sm:gap-3">
                {orderedWeekdays(settings.weekStartsOn).map((weekday) => (
                  <DayBar
                    key={weekday}
                    value={weekMinutes[weekday]}
                    label={capitalizeFirst(weekdayLabel(weekday, locale, "short").replace(".", ""))}
                    longLabel={capitalizeFirst(weekdayLabel(weekday, locale, "long"))}
                    onChange={(minutes) => setDay(weekday, minutes)}
                  />
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[var(--border)] pt-3">
              <p className="text-[12.5px] text-faint">{st("wizard_time_hint")}</p>
              <p className="text-[13px] font-medium tabular-nums text-ink">{st("wizard_week_total", { time: duration(weekTotal * 60) })}</p>
            </div>
            {reserved > 0 ? <p className="mt-2 text-[12.5px] text-muted">{st("wizard_fixed_note", { time: duration(reserved * 60) })}</p> : null}
          </div>
        ) : null}

        {step === 1 && mode === "manual" ? (
          <div className="space-y-4">
            {modeSwitch}
            {!planSubjects.length ? (
              <NoSubjects onAdd={() => router.push("/home/study/subjects")} />
            ) : (
              <>
                <div>
                  <p className="mb-2 text-[12.5px] text-muted">{st("cycle_quick_add_subject")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {planSubjects.map((subject) => (
                      <button
                        key={subject.id}
                        type="button"
                        onClick={() => addBlock(subject.id)}
                        className="inline-flex h-8 items-center gap-2 rounded-full pl-2.5 pr-3 text-[12.5px] text-ink shadow-[inset_0_0_0_1px_var(--border)] transition hover:shadow-[inset_0_0_0_1px_var(--border-strong)]"
                      >
                        <Plus className="size-3.5 text-faint" />
                        <SubjectDot color={subject.color} />
                        {subject.name || st("untitled_subject")}
                      </button>
                    ))}
                  </div>
                </div>

                {manualBlocks.length ? (
                  <div>
                    <ol className="max-h-[20rem] divide-y divide-[var(--border)] overflow-y-auto border-y border-[var(--border)]">
                      {manualBlocks.map((item, index) => {
                        const subject = subjectById(item.subjectId);
                        const options = BLOCK_OPTIONS.includes(item.minutes) ? BLOCK_OPTIONS : [...BLOCK_OPTIONS, item.minutes].sort((a, b) => a - b);
                        return (
                          <li key={item.id} className="group flex items-center gap-2.5 py-1.5 text-[13px]">
                            <span className="w-5 text-right text-[11.5px] tabular-nums text-faint">{index + 1}</span>
                            <span aria-hidden className="h-5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color ? subjectTone(subject.color) : "var(--border-strong)" }} />
                            <span className="min-w-0 flex-1 truncate text-ink">{subject?.name ?? st("untitled_subject")}</span>
                            <div className="flex items-center opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                              <IconAction label={st("cycle_move_up")} disabled={index === 0} onClick={() => moveBlock(index, -1)}>
                                <ArrowUp />
                              </IconAction>
                              <IconAction label={st("cycle_move_down")} disabled={index === manualBlocks.length - 1} onClick={() => moveBlock(index, 1)}>
                                <ArrowDown />
                              </IconAction>
                              <IconAction
                                label={st("cycle_duplicate")}
                                onClick={() =>
                                  setManualBlocks((list) => {
                                    const copy = [...list];
                                    copy.splice(index + 1, 0, { ...item, id: nanoid(12) });
                                    return copy;
                                  })
                                }
                              >
                                <Copy />
                              </IconAction>
                              <IconAction label={st("cycle_remove_block")} danger onClick={() => setManualBlocks((list) => list.filter((_, position) => position !== index))}>
                                <Trash2 />
                              </IconAction>
                            </div>
                            <BareSelect
                              aria-label={`${st("col_time")}: ${subject?.name ?? ""}`}
                              value={item.minutes}
                              onChange={(event) =>
                                setManualBlocks((list) => list.map((entry, position) => (position === index ? { ...entry, minutes: Number(event.target.value) } : entry)))
                              }
                            >
                              {options.map((minutes) => (
                                <option key={minutes} value={minutes}>
                                  {duration(minutes * 60)}
                                </option>
                              ))}
                            </BareSelect>
                          </li>
                        );
                      })}
                    </ol>
                    <p className="mt-2 text-right text-[12.5px] tabular-nums text-muted">
                      {st("cycle_blocks_count", { count: manualBlocks.length })} · {duration(cycleTotal * 60)}
                      {freeTotal > 0 ? ` · ${st("cycle_rounds_estimate", { rounds })}` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="border-y border-dashed border-[var(--border-strong)] py-6 text-center text-[12.5px] text-faint">{st("cycle_blocks_empty")}</p>
                )}
              </>
            )}
          </div>
        ) : null}

        {step === 1 && mode === "auto" ? (
          <div className="space-y-4">
            {modeSwitch}
            <p className="text-[12.5px] leading-relaxed text-muted">{st("wizard_subjects_desc")}</p>
            {!planSubjects.length ? (
              <NoSubjects onAdd={() => router.push("/home/study/subjects")} />
            ) : (
              <div className="border-y border-[var(--border)]">
                <div className="hidden grid-cols-[1.25rem_minmax(0,1fr)_6rem_6rem_6.5rem] items-center gap-3 border-b border-[var(--border)] py-2 text-[11.5px] text-faint sm:grid">
                  <span />
                  <span>{st("col_subject")}</span>
                  <span>{st("wizard_weight")}</span>
                  <span>{st("wizard_level")}</span>
                  <span className="text-right">{st("pace_hours")}</span>
                </div>
                <ul className="max-h-[20rem] divide-y divide-[var(--border)] overflow-y-auto">
                  {configs.map((config) => {
                    const subject = subjectById(config.subjectId);
                    const minutes = config.included ? (shares.get(config.subjectId) ?? 0) : 0;
                    return (
                      <li
                        key={config.subjectId}
                        className={cn(
                          "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_6rem_6rem_6.5rem]",
                          !config.included && "opacity-50"
                        )}
                      >
                        <Checkbox
                          checked={config.included}
                          onCheckedChange={(value) => updateConfig(config.subjectId, { included: value === true })}
                          aria-label={subject?.name}
                        />
                        <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink">
                          <SubjectDot color={subject?.color} />
                          <span className="truncate">{subject?.name}</span>
                        </span>
                        <span className="col-start-3 row-start-1 text-right text-[12.5px] tabular-nums text-ink sm:col-start-5">
                          {config.included && minutes ? duration(minutes * 60) : "–"}
                          {config.included && shareSum ? (
                            <span className="ml-1.5 text-[11px] text-faint">{Math.round((minutes / shareSum) * 100)}%</span>
                          ) : null}
                        </span>
                        <span className="col-span-2 col-start-2 flex items-center gap-4 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:contents">
                          <span className="flex items-center gap-1.5 sm:block">
                            <span className="text-[11px] text-faint sm:hidden">{st("wizard_weight")}</span>
                            <LevelRuler value={config.weight} label={st("wizard_weight")} onChange={(value) => updateConfig(config.subjectId, { weight: value })} />
                          </span>
                          <span className="flex items-center gap-1.5 sm:block">
                            <span className="text-[11px] text-faint sm:hidden">{st("wizard_level")}</span>
                            <LevelRuler value={config.level} label={st("wizard_level")} onChange={(value) => updateConfig(config.subjectId, { level: value })} />
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              <span>{st("wizard_block_size")}</span>
              <span className="flex items-center gap-1">
                <span className="text-[12px] text-faint">{st("wizard_block_min")}</span>
                <BareSelect aria-label={st("wizard_block_min")} value={minBlock} onChange={(event) => setMinBlock(Number(event.target.value))}>
                  {BLOCK_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {duration(value * 60)}
                    </option>
                  ))}
                </BareSelect>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-[12px] text-faint">{st("wizard_block_max")}</span>
                <BareSelect aria-label={st("wizard_block_max")} value={maxBlock} onChange={(event) => setMaxBlock(Number(event.target.value))}>
                  {BLOCK_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {duration(value * 60)}
                    </option>
                  ))}
                </BareSelect>
              </span>
            </div>
            {reserved > 0 ? <p className="text-[12.5px] text-muted">{st("wizard_fixed_note", { time: duration(reserved * 60) })}</p> : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <CyclePreview items={blocks} />
              <div className="min-w-0 flex-1">
                <p className="text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{duration(cycleTotal * 60)}</p>
                <p className="mt-2 text-[13px] text-muted">
                  {st("cycle_blocks_count", { count: blocks.length })}
                  {freeTotal > 0 ? ` · ${st("cycle_rounds_estimate", { rounds })}` : ""}
                </p>
                {mode === "auto" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setManualBlocks(autoPreview.map((item) => ({ ...item, id: nanoid(12) })));
                      setMode("manual");
                      setStep(1);
                    }}
                    className="mt-3 text-[12.5px] text-muted underline decoration-[var(--border-strong)] underline-offset-4 transition hover:text-ink hover:decoration-current"
                  >
                    {st("wizard_adjust_order")}
                  </button>
                ) : null}
              </div>
            </div>
            <ol className="grid grid-cols-1 gap-x-8 border-t border-[var(--border)] sm:grid-cols-2">
              {blocks.map((item, index) => {
                const subject = subjectById(item.subjectId);
                return (
                  <li key={item.id} className="flex items-center gap-2.5 border-b border-[var(--border)] py-2 text-[13px]">
                    <span className="w-5 text-right text-[11.5px] tabular-nums text-faint">{index + 1}</span>
                    <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color ? subjectTone(subject.color) : undefined }} />
                    <span className="min-w-0 flex-1 truncate text-ink">{subject?.name ?? st("untitled_subject")}</span>
                    <span className="text-[12px] tabular-nums text-muted">{duration(item.minutes * 60)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-[12.5px] font-medium text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] px-6 py-3.5">
        <Button type="button" variant="ghost" onClick={() => (step === 0 ? onClose() : goTo(step - 1))}>
          {step === 0 ? st("cancel") : st("back")}
        </Button>
        {step < 2 ? (
          <Button type="button" variant="primary" onClick={() => goTo(step + 1)}>
            {st("next")}
          </Button>
        ) : (
          <Button type="button" variant="primary" disabled={saving || !blocks.length} onClick={() => void save()}>
            {st("wizard_save")}
          </Button>
        )}
      </div>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-[7px] text-faint transition hover:bg-[var(--surface-hover)] disabled:opacity-30 [&_svg]:size-3.5",
        danger ? "hover:text-[var(--danger)]" : "hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function NoSubjects({ onAdd }: { onAdd: () => void }) {
  const { st } = useStudyT();
  return (
    <div className="border-y border-dashed border-[var(--border-strong)] py-6 text-center">
      <p className="text-[13px] text-ink">{st("cycle_no_subjects_warning")}</p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={onAdd}>
        <BookOpen />
        {st("cycle_add_subjects_cta")}
      </Button>
    </div>
  );
}
