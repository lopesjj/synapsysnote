/**
 * Memória de curto prazo dos modelos que acabaram de recusar.
 *
 * O plano gratuito dá 20 requisições por DIA e 5 por minuto em cada flash
 * (500/dia e 15/min no lite), e uma aula de 50 min são 18 trechos. Sem esta
 * memória, cada trecho recomeçava a lista pelo mesmo modelo esgotado: 18 idas
 * e voltas jogadas fora quando a recusa era de cota, e ~50 s perdidos por
 * trecho quando era congestionamento — 15 min de espera para chegar ao mesmo
 * lugar.
 *
 * Vale por instância do servidor e some quando ela é reciclada: é atalho, não
 * verdade. Por isso nada fica banido de forma definitiva, e quando todos estão
 * de molho a cadeia ainda tenta o que acorda primeiro, para nunca ficar sem
 * saída.
 */
export type CooldownKind = "quota-day" | "quota-minute" | "busy" | "missing";

const DURATION_MS: Record<CooldownKind, number> = {
  "quota-day": 30 * 60_000,
  "quota-minute": 65_000,
  busy: 30_000,
  missing: 12 * 60 * 60_000,
};

interface Cooldown {
  until: number;
  kind: CooldownKind;
}

const cooldowns = new Map<string, Cooldown>();

export function noteModelRefused(
  model: string,
  kind: CooldownKind,
  retryAfterMs?: number,
  now: number = Date.now()
): void {
  if (!model) return;
  const until = now + Math.max(DURATION_MS[kind], retryAfterMs ?? 0);
  const current = cooldowns.get(model);
  // Um 503 logo depois de um 429 diário não pode encurtar o descanso longo.
  if (current && current.until > now && current.until > until) return;
  cooldowns.set(model, { until, kind });
}

export function noteModelWorked(model: string): void {
  cooldowns.delete(model);
}

export function restingForMs(model: string, now: number = Date.now()): number {
  const entry = cooldowns.get(model);
  // Vencido conta como disponível, mas o registro fica: uma consulta não deve
  // apagar estado (o mapa nunca passa do tamanho da lista de modelos, e apagar
  // na leitura faria uma checagem adiantada perder o descanso já anotado).
  if (!entry || entry.until <= now) return 0;
  return entry.until - now;
}

export function isModelResting(model: string, now: number = Date.now()): boolean {
  return restingForMs(model, now) > 0;
}

/**
 * Tira da frente os modelos que já recusaram há pouco. Se todos estiverem de
 * molho, devolve só o que acorda primeiro: melhor uma tentativa provável de
 * falhar do que desistir sem tentar nenhuma.
 */
export function orderByAvailability(chain: string[], now: number = Date.now()): string[] {
  const ready = chain.filter((model) => !isModelResting(model, now));
  if (ready.length > 0) return ready;
  const soonest = [...chain].sort((a, b) => restingForMs(a, now) - restingForMs(b, now));
  return soonest.slice(0, 1);
}

/** Motivo do descanso mais grave em vigor, para explicar a recusa a quem chamou. */
export function restingKindOf(chain: string[], now: number = Date.now()): CooldownKind | null {
  const kinds = chain
    .map((model) => cooldowns.get(model))
    .filter((entry): entry is Cooldown => Boolean(entry && entry.until > now))
    .map((entry) => entry.kind);
  if (kinds.length === 0) return null;
  if (kinds.includes("quota-day")) return "quota-day";
  if (kinds.includes("quota-minute")) return "quota-minute";
  if (kinds.includes("busy")) return "busy";
  return "missing";
}

/** Só para os testes: zera a memória entre cenários. */
export function resetModelCooldowns(): void {
  cooldowns.clear();
}

/** "27s" / "1.5s" -> milissegundos. O Gemini manda isso no RetryInfo do 429. */
export function parseRetryDelay(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^([\d.]+)s$/);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(5 * 60_000, Math.round(seconds * 1000));
}
