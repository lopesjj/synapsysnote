"use client";

import { useId, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Clock,
  Copy,
  Minus,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/primitives";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { capitalizeFirst, orderedWeekdays, weekdayLabel } from "@/lib/study/dates";
import { cycleLength, generateCycleItems, subjectMinutes } from "@/lib/study/cycle";
import type { CycleItem, CycleSubjectConfig } from "@/types/study";
import { GoalMark, SubjectDot } from "./ui";

const BLOCK_OPTIONS = [15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120];

function Dots({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={value === level}
          aria-label={`${label} ${level}`}
          onClick={() => onChange(level)}
          className={cn(
            "size-3.5 rounded-full border transition",
            level <= value ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)] bg-transparent hover:border-[var(--accent)]"
          )}
        />
      ))}
    </div>
  );
}

export function CycleWizard({
  open,
  onOpenChange,
  initialMode = "manual",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "manual" | "auto";
}) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      {open ? <WizardBody initialMode={initialMode} onClose={() => onOpenChange(false)} /> : null}
    </DialogShell>
  );
}

function WizardBody({ initialMode, onClose }: { initialMode: "manual" | "auto"; onClose: () => void }) {
  const { st, locale, duration } = useStudyT();
  const router = useRouter();
  const idPrefix = useId();
  const { planSubjects, planCycle, settings, actions, activePlan } = useStudy();
  const [mode, setMode] = useState<"manual" | "auto">(initialMode);
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
        included: planCycle ? Boolean(existing) : true,
      };
    })
  );

  const [minBlock, setMinBlock] = useState(planCycle?.minBlock ?? 30);
  const [maxBlock, setMaxBlock] = useState(planCycle?.maxBlock ?? 60);

  const [manualBlocks, setManualBlocks] = useState<CycleItem[]>(() => {
    if (planCycle?.items?.length) {
      return planCycle.items.map((item) => ({ ...item }));
    }
    if (planSubjects.length) {
      return planSubjects.map((subject, index) => ({
        id: `block-${index}-${Date.now()}`,
        subjectId: subject.id,
        minutes: 50,
      }));
    }
    return [];
  });

  const [customSubjectId, setCustomSubjectId] = useState<string>(() => planSubjects[0]?.id ?? "");
  const [customDuration, setCustomDuration] = useState<number>(50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const included = useMemo(() => configs.filter((config) => config.included), [configs]);
  const autoInput = useMemo(
    () => ({
      subjects: included.map(({ subjectId, weight, level }) => ({ subjectId, weight, level })),
      weekMinutes,
      minBlock: Math.min(minBlock, maxBlock),
      maxBlock: Math.max(minBlock, maxBlock),
    }),
    [included, maxBlock, minBlock, weekMinutes]
  );
  const shares = useMemo(() => subjectMinutes(autoInput), [autoInput]);
  const autoPreview = useMemo(() => generateCycleItems(autoInput, (index) => `auto-${idPrefix}-${index}`), [autoInput, idPrefix]);

  const activeBlocks = mode === "manual" ? manualBlocks : autoPreview;
  const totalWeekMinutes = cycleLength({ weekMinutes });
  const cycleTotalMinutes = activeBlocks.reduce((sum, item) => sum + item.minutes, 0);

  const estimatedRounds =
    cycleTotalMinutes > 0 && totalWeekMinutes > 0
      ? (totalWeekMinutes / cycleTotalMinutes).toFixed(1)
      : "0";

  const steps = [st("wizard_step_time"), st("wizard_step_subjects"), st("wizard_step_review")];

  const handleAddManualBlock = (subjectId: string, minutes: number = customDuration) => {
    if (!subjectId) return;
    const newItem: CycleItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      subjectId,
      minutes,
    };
    setManualBlocks((prev) => [...prev, newItem]);
    setError(null);
  };

  const handleDuplicateBlock = (index: number) => {
    const target = manualBlocks[index];
    if (!target) return;
    const duplicate: CycleItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      subjectId: target.subjectId,
      minutes: target.minutes,
    };
    setManualBlocks((prev) => {
      const copy = [...prev];
      copy.splice(index + 1, 0, duplicate);
      return copy;
    });
  };

  const handleRemoveBlock = (index: number) => {
    setManualBlocks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleMoveBlock = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= manualBlocks.length) return;
    setManualBlocks((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleUpdateBlockMinutes = (index: number, delta: number) => {
    setManualBlocks((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const newMinutes = Math.max(10, Math.min(240, item.minutes + delta));
        return { ...item, minutes: newMinutes };
      })
    );
  };

  const handleSwitchToManualFromAuto = () => {
    if (autoPreview.length > 0) {
      setManualBlocks(autoPreview.map((item) => ({ ...item, id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })));
    }
    setMode("manual");
  };

  const next = () => {
    if (step === 0 && totalWeekMinutes <= 0) {
      setError(st("wizard_need_time"));
      return;
    }
    if (step === 1) {
      if (mode === "manual" && manualBlocks.length === 0) {
        setError(st("cycle_blocks_empty"));
        return;
      }
      if (mode === "auto" && !included.length) {
        setError(st("wizard_need_subjects"));
        return;
      }
    }
    setError(null);
    setStep((value) => Math.min(2, value + 1));
  };

  const save = async () => {
    if (!activePlan) return;
    if (mode === "manual" && manualBlocks.length === 0) {
      setError(st("cycle_blocks_empty"));
      return;
    }
    if (mode === "auto" && autoPreview.length === 0) {
      setError(st("wizard_need_subjects"));
      return;
    }

    setSaving(true);
    try {
      if (mode === "manual") {
        await actions.saveCycle(activePlan.id, {
          subjects: planSubjects.map((subject) => ({
            subjectId: subject.id,
            weight: 3,
            level: 3,
          })),
          weekMinutes,
          minBlock: Math.min(...manualBlocks.map((b) => b.minutes), 30),
          maxBlock: Math.max(...manualBlocks.map((b) => b.minutes), 60),
          items: manualBlocks,
        });
      } else {
        await actions.saveCycle(activePlan.id, {
          ...autoInput,
          items: autoPreview,
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

  const adjust = (weekday: number, delta: number) =>
    setWeekMinutes((list) => list.map((value, index) => (index === weekday ? Math.max(0, Math.min(16 * 60, value + delta)) : value)));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[var(--border)] px-5 pb-3.5 pt-4 pr-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-ink">{st("schedule_setup")}</h2>
            {activePlan ? (
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                <GoalMark icon={activePlan.icon} name={activePlan.name} seed={activePlan.id} size={14} />
                <span>{st("cycle_goal_badge", { name: activePlan.name || st("untitled_goal") })}</span>
              </div>
            ) : null}
          </div>
          <div className="inline-flex rounded-lg bg-[var(--surface-2)] p-1">
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition",
                mode === "manual" ? "bg-[var(--surface)] text-ink shadow-sm" : "text-muted hover:text-ink"
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              {st("cycle_mode_manual")}
            </button>
            <button
              type="button"
              onClick={() => setMode("auto")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition",
                mode === "auto" ? "bg-[var(--surface)] text-ink shadow-sm" : "text-muted hover:text-ink"
              )}
            >
              <Sparkles className="size-3.5" />
              {st("cycle_mode_auto")}
            </button>
          </div>
        </div>

        <ol className="mt-3.5 grid grid-cols-3 gap-2">
          {steps.map((label, index) => (
            <li key={label} className="min-w-0" aria-current={index === step ? "step" : undefined}>
              <span className={cn("block h-[3px] rounded-full transition-colors duration-300", index <= step ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]")} />
              <span className={cn("mt-1.5 block truncate text-[12px]", index === step ? "font-medium text-ink" : index < step ? "text-muted" : "text-faint")}>{label}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {step === 0 ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted">{st("wizard_time_desc")}</p>
            <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
              {orderedWeekdays(settings.weekStartsOn).map((weekday) => (
                <li key={weekday} className="flex items-center gap-3 px-3.5 py-2">
                  <span className="w-28 shrink-0 text-[13px] text-ink max-sm:w-24">{capitalizeFirst(weekdayLabel(weekday, locale, "long"))}</span>
                  <div className="relative h-1.5 flex-1 rounded-full bg-[var(--surface-2)]">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, (weekMinutes[weekday] / 480) * 100)}%` }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="-15" onClick={() => adjust(weekday, -15)}>
                      <Minus />
                    </Button>
                    <span className={cn("w-20 text-center text-[12.5px] tabular-nums", weekMinutes[weekday] ? "text-ink" : "text-faint")}>
                      {weekMinutes[weekday] ? duration(weekMinutes[weekday] * 60) : st("day_free")}
                    </span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="+15" onClick={() => adjust(weekday, 15)}>
                      <Plus />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-right text-[12.5px] font-medium tabular-nums text-ink">{st("wizard_week_total", { time: duration(totalWeekMinutes * 60) })}</p>
          </div>
        ) : null}

        {step === 1 && mode === "manual" ? (
          <div className="space-y-4">
            <p className="text-[12.5px] leading-relaxed text-muted">{st("cycle_mode_manual_desc")}</p>

            {planSubjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-6 text-center">
                <AlertCircle className="size-8 text-[var(--accent)] opacity-80" />
                <p className="mt-2 text-[13px] font-semibold text-ink">{st("cycle_no_subjects_warning")}</p>
                <Button className="mt-3" size="sm" variant="primary" onClick={() => router.push("/home/study/subjects")}>
                  <BookOpen />
                  {st("cycle_add_subjects_cta")}
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
                  <span className="block text-[11.5px] font-semibold uppercase tracking-wider text-faint">
                    {st("cycle_quick_add_subject")}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {planSubjects.map((subject) => (
                      <button
                        key={subject.id}
                        type="button"
                        onClick={() => handleAddManualBlock(subject.id)}
                        className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[12px] font-medium text-ink transition hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]"
                      >
                        <SubjectDot color={subject.color} />
                        <span>{subject.name}</span>
                        <Plus className="size-3 text-muted group-hover:text-[var(--accent)]" />
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                    <span className="text-[11.5px] text-muted">{st("cycle_custom_add")}:</span>
                    <select
                      value={customSubjectId}
                      onChange={(e) => setCustomSubjectId(e.target.value)}
                      className="h-7.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-ink outline-none"
                    >
                      {planSubjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={customDuration}
                      onChange={(e) => setCustomDuration(Number(e.target.value))}
                      className="h-7.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-ink outline-none"
                    >
                      {BLOCK_OPTIONS.map((mins) => (
                        <option key={mins} value={mins}>
                          {duration(mins * 60)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAddManualBlock(customSubjectId || planSubjects[0]?.id, customDuration)}
                    >
                      <Plus />
                      {st("cycle_add_block")}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-ink">
                      {st("cycle_blocks_count", { count: manualBlocks.length })}
                    </span>
                    <span className="tabular-nums text-muted">
                      {st("cycle_duration_total", { time: duration(cycleTotalMinutes * 60) })}
                      {totalWeekMinutes > 0 ? ` • ${st("cycle_rounds_estimate", { rounds: estimatedRounds })}` : ""}
                    </span>
                  </div>

                  {manualBlocks.length === 0 ? (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-6 text-center text-[12.5px] text-faint">
                      {st("cycle_blocks_empty")}
                    </div>
                  ) : (
                    <ol className="max-h-[22rem] divide-y divide-[var(--border)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)]">
                      {manualBlocks.map((item, index) => {
                        const subject = planSubjects.find((s) => s.id === item.subjectId);
                        return (
                          <li
                            key={item.id}
                            className="flex items-center gap-2.5 bg-[var(--surface)] px-3 py-2 text-[12.5px] transition hover:bg-[var(--surface-hover)]"
                          >
                            <span className="w-5 text-right font-mono text-[11px] text-faint">
                              {index + 1}
                            </span>
                            <span
                              className="block h-5 w-[3px] shrink-0 rounded-full"
                              style={{ backgroundColor: subject?.color ?? "var(--border-strong)" }}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium text-ink">
                              {subject?.name ?? st("untitled_subject")}
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateBlockMinutes(index, -5)}
                                className="flex size-5 items-center justify-center rounded text-muted hover:bg-[var(--surface-2)] hover:text-ink"
                                aria-label="-5"
                              >
                                <Minus className="size-3" />
                              </button>
                              <span className="w-14 text-center tabular-nums text-muted">
                                {duration(item.minutes * 60)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateBlockMinutes(index, 5)}
                                className="flex size-5 items-center justify-center rounded text-muted hover:bg-[var(--surface-2)] hover:text-ink"
                                aria-label="+5"
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>

                            <div className="flex items-center gap-0.5 border-l border-[var(--border)] pl-1.5 text-faint">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveBlock(index, -1)}
                                className="flex size-6 items-center justify-center rounded hover:bg-[var(--surface-2)] hover:text-ink disabled:opacity-30"
                                aria-label={st("cycle_move_up")}
                                title={st("cycle_move_up")}
                              >
                                <ArrowUp className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === manualBlocks.length - 1}
                                onClick={() => handleMoveBlock(index, 1)}
                                className="flex size-6 items-center justify-center rounded hover:bg-[var(--surface-2)] hover:text-ink disabled:opacity-30"
                                aria-label={st("cycle_move_down")}
                                title={st("cycle_move_down")}
                              >
                                <ArrowDown className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateBlock(index)}
                                className="flex size-6 items-center justify-center rounded hover:bg-[var(--surface-2)] hover:text-ink"
                                aria-label={st("cycle_duplicate")}
                                title={st("cycle_duplicate")}
                              >
                                <Copy className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveBlock(index)}
                                className="flex size-6 items-center justify-center rounded hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                                aria-label={st("cycle_remove_block")}
                                title={st("cycle_remove_block")}
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </>
            )}
          </div>
        ) : null}

        {step === 1 && mode === "auto" ? (
          <div className="space-y-4">
            <p className="text-[12.5px] leading-relaxed text-muted">{st("wizard_subjects_desc")}</p>
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
              <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_6.5rem_6.5rem_3.5rem] items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-2)]/50 px-3.5 py-2 text-[11px] font-medium text-faint">
                <span />
                <span>{st("col_subject")}</span>
                <span>{st("wizard_weight")}</span>
                <span>{st("wizard_level")}</span>
                <span className="text-right">%</span>
              </div>
              <ul className="max-h-[20rem] divide-y divide-[var(--border)] overflow-y-auto">
                {configs.map((config) => {
                  const subject = planSubjects.find((entry) => entry.id === config.subjectId);
                  const minutes = shares.get(config.subjectId) ?? 0;
                  const sum = [...shares.values()].reduce((acc, value) => acc + value, 0);
                  return (
                    <li
                      key={config.subjectId}
                      className={cn(
                        "grid grid-cols-[1.5rem_minmax(0,1fr)_6.5rem_6.5rem_3.5rem] items-center gap-3 px-3.5 py-2",
                        !config.included && "opacity-50"
                      )}
                    >
                      <Checkbox
                        checked={config.included}
                        onCheckedChange={(value) =>
                          setConfigs((list) =>
                            list.map((entry) => (entry.subjectId === config.subjectId ? { ...entry, included: value === true } : entry))
                          )
                        }
                        aria-label={subject?.name}
                      />
                      <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink">
                        <SubjectDot color={subject?.color} />
                        <span className="truncate">{subject?.name}</span>
                      </span>
                      <Dots
                        value={config.weight}
                        label={st("wizard_weight")}
                        onChange={(value) =>
                          setConfigs((list) =>
                            list.map((entry) => (entry.subjectId === config.subjectId ? { ...entry, weight: value } : entry))
                          )
                        }
                      />
                      <Dots
                        value={config.level}
                        label={st("wizard_level")}
                        onChange={(value) =>
                          setConfigs((list) =>
                            list.map((entry) => (entry.subjectId === config.subjectId ? { ...entry, level: value } : entry))
                          )
                        }
                      />
                      <span className="text-right text-[12px] tabular-nums text-muted">
                        {config.included && sum ? `${Math.round((minutes / sum) * 100)}%` : "–"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[12px] font-medium text-muted">{st("wizard_block_size")}</span>
              <label className="flex items-center gap-1.5 text-[12px] text-muted">
                {st("wizard_block_min")}
                <select
                  value={minBlock}
                  onChange={(event) => setMinBlock(Number(event.target.value))}
                  className="h-8 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12.5px] text-ink outline-none"
                >
                  {BLOCK_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {duration(value * 60)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-muted">
                {st("wizard_block_max")}
                <select
                  value={maxBlock}
                  onChange={(event) => setMaxBlock(Number(event.target.value))}
                  className="h-8 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12.5px] text-ink outline-none"
                >
                  {BLOCK_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {duration(value * 60)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    {st("cycle_blocks_count", { count: activeBlocks.length })} • {duration(cycleTotalMinutes * 60)}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {totalWeekMinutes > 0 ? st("cycle_rounds_estimate", { rounds: estimatedRounds }) : ""}
                  </p>
                </div>
                {mode === "auto" ? (
                  <Button type="button" size="sm" variant="secondary" onClick={handleSwitchToManualFromAuto}>
                    <SlidersHorizontal />
                    {st("cycle_mode_manual")}
                  </Button>
                ) : null}
              </div>
            </div>

            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {activeBlocks.map((item, index) => {
                const subject = planSubjects.find((entry) => entry.id === item.subjectId);
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-sm"
                  >
                    <span className="w-5 text-right font-mono text-[11px] tabular-nums text-faint">{index + 1}</span>
                    <span className="block h-5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color }} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{subject?.name}</span>
                    <span className="text-[11.5px] tabular-nums text-muted">{duration(item.minutes * 60)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-[12.5px] font-medium text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-3">
        <Button type="button" variant="ghost" onClick={() => (step === 0 ? onClose() : setStep((value) => value - 1))}>
          {step === 0 ? st("cancel") : st("back")}
        </Button>
        {step < 2 ? (
          <Button type="button" variant="primary" onClick={next}>
            {st("next")}
          </Button>
        ) : (
          <Button type="button" variant="primary" disabled={saving || !activeBlocks.length} onClick={() => void save()}>
            {st("wizard_save")}
          </Button>
        )}
      </div>
    </div>
  );
}
