import { planErrorBody, toPlanError } from "@/lib/plans/errors";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonError(error: unknown) {
  const planError = toPlanError(error);
  if (planError) {
    return Response.json(planErrorBody(planError), { status: 403 });
  }
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Erro interno";
  return Response.json({ error: message }, { status: 500 });
}
