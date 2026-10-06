import { FEATURE_KEYS, LIMIT_KEYS, type FeatureKey, type LimitKey } from "./definitions";

export interface LimitViolation {
  key: LimitKey;
  limit: number;
  count: number;
}

export type PlanErrorCode = "read_only" | "limit" | "feature" | "unavailable";

export interface PlanErrorDetail {
  code: PlanErrorCode;
  violation: LimitViolation | null;
  feature: FeatureKey | null;
}

export function planErrorMessage(detail: PlanErrorDetail): string {
  if (detail.code === "limit" && detail.violation) {
    return `PLAN_LIMIT:${detail.violation.key}:${detail.violation.limit}`;
  }
  if (detail.code === "feature" && detail.feature) return `PLAN_FEATURE:${detail.feature}`;
  if (detail.code === "read_only") return "PLAN_READ_ONLY";
  return "PLAN_UNAVAILABLE";
}

export class PlanError extends Error {
  readonly code: PlanErrorCode;
  readonly violation: LimitViolation | null;
  readonly feature: FeatureKey | null;
  notified = false;

  constructor(detail: PlanErrorDetail) {
    super(planErrorMessage(detail));
    this.name = "PlanError";
    this.code = detail.code;
    this.violation = detail.violation;
    this.feature = detail.feature;
  }

  static readOnly(): PlanError {
    return new PlanError({ code: "read_only", violation: null, feature: null });
  }

  static feature(feature: FeatureKey): PlanError {
    return new PlanError({ code: "feature", violation: null, feature });
  }

  static limit(violation: LimitViolation): PlanError {
    return new PlanError({ code: "limit", violation, feature: null });
  }

  static unavailable(): PlanError {
    return new PlanError({ code: "unavailable", violation: null, feature: null });
  }
}

export function isPlanError(error: unknown): error is PlanError {
  return error instanceof PlanError || (error instanceof Error && error.name === "PlanError");
}

export function parsePlanErrorMessage(message: string | null | undefined): PlanErrorDetail | null {
  if (!message) return null;
  const value = message.trim();
  if (value === "PLAN_READ_ONLY") return { code: "read_only", violation: null, feature: null };
  if (value === "PLAN_UNAVAILABLE") return { code: "unavailable", violation: null, feature: null };
  const feature = /^PLAN_FEATURE:([A-Za-z]+)$/.exec(value);
  if (feature && (FEATURE_KEYS as readonly string[]).includes(feature[1])) {
    return { code: "feature", violation: null, feature: feature[1] as FeatureKey };
  }
  const limit = /^PLAN_LIMIT:([A-Za-z]+):(\d+)$/.exec(value);
  if (limit && (LIMIT_KEYS as readonly string[]).includes(limit[1])) {
    const max = Number(limit[2]);
    return { code: "limit", violation: { key: limit[1] as LimitKey, limit: max, count: max }, feature: null };
  }
  return null;
}

export function toPlanError(error: unknown): PlanError | null {
  if (error instanceof PlanError) return error;
  if (!(error instanceof Error)) return null;
  const detail = parsePlanErrorMessage(error.message);
  return detail ? new PlanError(detail) : null;
}

export interface PlanErrorBody {
  error: string;
  plan: PlanErrorDetail;
}

export function planErrorBody(error: PlanError): PlanErrorBody {
  return {
    error: error.message,
    plan: { code: error.code, violation: error.violation, feature: error.feature },
  };
}
