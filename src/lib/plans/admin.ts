import { isPaidPlan, type AssignablePlanId } from "./definitions";

/** Campos do formulário de plano do painel do proprietário. */
export interface PlanForm {
  plan: AssignablePlanId;
  /** Validade do plano pago, em AAAA-MM-DD; vazio = sem vencimento. */
  expires: string;
  /** Fim do teste, em AAAA-MM-DD; vazio = encerrar o teste. */
  trial: string;
  /** Fim do teste como veio do servidor, para saber se mudou. */
  loadedTrial: string;
  note: string;
}

export interface PlanFormPayload {
  plan: AssignablePlanId;
  expiresAt: number | null;
  trialEndsAt?: number;
  note: string | null;
}

export function timestampToDateInput(timestamp: number | null | undefined): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A data escolhida vale até o fim daquele dia, no fuso de quem preenche. */
export function dateInputToTimestamp(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = new Date(`${value}T23:59:59`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function planFormExpiresAt(form: PlanForm): number | null {
  return isPaidPlan(form.plan) && form.expires ? dateInputToTimestamp(form.expires) : null;
}

export function planFormTrialEndsAt(form: PlanForm): number | null {
  return form.trial ? dateInputToTimestamp(form.trial) : null;
}

/** Validade precisa ser uma data futura; o servidor recusa o resto. */
export function planFormExpiryInvalid(form: PlanForm, now = Date.now()): boolean {
  if (!isPaidPlan(form.plan) || !form.expires) return false;
  const timestamp = planFormExpiresAt(form);
  return timestamp === null || timestamp <= now;
}

/**
 * Quando o plano pago vence antes do fim do teste, a conta volta ao teste
 * (com tudo do Ultra) até essa data. Devolve o fim do teste para o aviso.
 */
export function planFormTrialConflict(form: PlanForm): number | null {
  const trialEndsAt = planFormTrialEndsAt(form);
  const expiresAt = planFormExpiresAt(form);
  if (trialEndsAt === null || expiresAt === null) return null;
  return expiresAt < trialEndsAt ? trialEndsAt : null;
}

/**
 * Corpo do POST. O fim do teste só viaja quando o proprietário mexeu na data:
 * reenviar a mesma data empurrava o teste para o fim daquele dia a cada
 * gravação, somando um dia a mais na contagem.
 */
export function planFormPayload(form: PlanForm): PlanFormPayload {
  const payload: PlanFormPayload = {
    plan: form.plan,
    expiresAt: planFormExpiresAt(form),
    note: form.note.trim() ? form.note.trim() : null,
  };
  if (form.trial !== form.loadedTrial) payload.trialEndsAt = planFormTrialEndsAt(form) ?? 0;
  return payload;
}
