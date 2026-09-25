/**
 * Corrida escalonada ("hedged") pela cadeia de modelos de transcrição.
 *
 * Antes a cadeia era estritamente sequencial: um modelo congestionado segurava
 * a chamada ~50 s antes de responder 503, e só então o próximo era tentado —
 * três modelos ruins somavam dois minutos e meio para um trecho de 3 min que o
 * modelo saudável transcreve em 5-15 s. Aqui, se o modelo da vez não responde
 * dentro do tempo esperado para aquele tamanho de áudio, o seguinte entra em
 * paralelo; o primeiro texto vence e o resto é abortado. Uma recusa rápida
 * (cota, 404, 503 imediato) dispara o próximo na hora, sem espera.
 *
 * Fica fora da rota para poder ser exercitado sem rede
 * (`npm run verify:transcription`).
 */

export type RaceReason =
  | "OK"
  | "TRUNCATED"
  | "NO_SPEECH"
  | "SERVICE_BUSY"
  | "MODEL_MISSING"
  | "QUOTA"
  | "NOT_CONFIGURED"
  | "FAILED";

export interface RaceResult {
  text: string;
  reason: RaceReason;
  quotaScope?: "day" | "minute";
  retryAfterMs?: number;
}

export interface RaceOptions {
  /** Sem resposta depois disso, o próximo modelo entra em paralelo. */
  hedgeDelayMs: number;
  /** Teto de cada chamada. */
  callTimeoutMs: number;
  /** Momento (epoch ms) a partir do qual nenhuma chamada nova começa. */
  deadline: number;
  /** Chamadas simultâneas no máximo (a original mais os reforços). */
  maxInFlight?: number;
  /** Abaixo disto não vale abrir mais uma chamada. */
  minAttemptMs?: number;
  /** Relógio injetável para teste. */
  now?: () => number;
}

export type RaceRunner = (
  model: string,
  signal: AbortSignal,
  timeoutMs: number
) => Promise<RaceResult>;

/** Recusas que dizem respeito ao modelo, não ao arquivo: vale tentar outro. */
export function isModelLevelFailure(reason: RaceReason): boolean {
  return reason === "SERVICE_BUSY" || reason === "MODEL_MISSING" || reason === "QUOTA";
}

export interface RaceOutcome extends RaceResult {
  /** Modelo que entregou o texto, quando houve. */
  model?: string;
  /** Quantas chamadas chegaram a sair. */
  launched: number;
}

export function raceModels(
  attempts: string[],
  run: RaceRunner,
  options: RaceOptions,
  onSettled?: (model: string, result: RaceResult) => void
): Promise<RaceOutcome> {
  const clock = options.now ?? (() => Date.now());
  const maxInFlight = Math.max(1, options.maxInFlight ?? 2);
  const minAttemptMs = options.minAttemptMs ?? 8_000;
  const queue = [...attempts];

  return new Promise<RaceOutcome>((resolve) => {
    const running = new Map<string, AbortController>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let finished = false;
    let launched = 0;
    let lastReason: RaceReason = "NOT_CONFIGURED";
    let quotaScope: "day" | "minute" | undefined;
    /** Veredito sobre o arquivo (sem fala, recusa) que vale mais que um 503 tardio. */
    let verdict: RaceResult | null = null;

    const finish = (outcome: RaceOutcome) => {
      if (finished) return;
      finished = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      // Quem perdeu a corrida é cancelado: segurar a conexão só gastaria cota
      // e uma vaga de concorrência no servidor.
      for (const controller of running.values()) controller.abort();
      running.clear();
      resolve(outcome);
    };

    const failIfIdle = () => {
      if (finished || running.size > 0) return;
      if (launchNext()) return;
      if (verdict) {
        finish({ ...verdict, launched });
        return;
      }
      finish({ text: "", reason: quotaScope ? "QUOTA" : lastReason, quotaScope, launched });
    };

    /** Abre a próxima chamada possível. Devolve se abriu. */
    const launchNext = (): boolean => {
      if (finished || running.size >= maxInFlight) return false;
      const remaining = options.deadline - clock();
      if (remaining < minAttemptMs) return false;
      // O mesmo modelo duas vezes ao mesmo tempo seria entrar na mesma fila
      // duas vezes: pula para o próximo diferente.
      const index = queue.findIndex((model) => !running.has(model));
      if (index < 0) return false;
      const [model] = queue.splice(index, 1);

      const controller = new AbortController();
      running.set(model, controller);
      launched += 1;

      const hedge = setTimeout(() => {
        timers.delete(hedge);
        if (!finished && running.has(model)) launchNext();
      }, options.hedgeDelayMs);
      timers.add(hedge);

      const timeoutMs = Math.max(1, Math.min(options.callTimeoutMs, remaining));
      run(model, controller.signal, timeoutMs)
        .catch((): RaceResult => ({ text: "", reason: "SERVICE_BUSY" }))
        .then((result) => {
          clearTimeout(hedge);
          timers.delete(hedge);
          // Resposta de quem já foi cancelado não conta — nem para o descanso
          // do modelo, que não recusou nada.
          if (finished || running.get(model) !== controller) return;
          running.delete(model);
          onSettled?.(model, result);

          if (result.text) {
            finish({ ...result, model, launched });
            return;
          }
          lastReason = result.reason;
          if (result.reason === "QUOTA") {
            // A do dia manda: se um modelo esgotou o dia, a mensagem não pode
            // ser "espere um minuto".
            if (result.quotaScope === "day" || !quotaScope) {
              quotaScope = result.quotaScope === "day" ? "day" : "minute";
            }
          }
          if (!isModelLevelFailure(result.reason)) {
            // Sem fala, bloqueio ou arquivo recusado: se repetiria igual nos
            // outros. Um reforço ainda em voo pode ter texto, então espera
            // por ele antes de desistir.
            verdict = result;
            queue.length = 0;
            failIfIdle();
            return;
          }
          failIfIdle();
          // Recusa rápida libera a vaga: o próximo entra já.
          if (running.size < maxInFlight && running.size > 0) launchNext();
        });
      return true;
    };

    if (!launchNext()) {
      finish({ text: "", reason: "SERVICE_BUSY", launched: 0 });
    }
  });
}

/**
 * Tempos da corrida em função da duração do áudio. Um trecho de 3 min
 * transcreve em 5-15 s no modelo saudável; o reforço entra perto dos 20 s e a
 * chamada desiste perto dos 50 s. Um arquivo de uma hora inteira precisa de
 * minutos só para o texto sair — com o teto fixo de 40 s de antes ele nunca
 * cabia, e cada tentativa jogava fora o trabalho do modelo.
 */
export function raceTimingFor(audioSeconds: number): {
  hedgeDelayMs: number;
  callTimeoutMs: number;
} {
  const seconds = Number.isFinite(audioSeconds) && audioSeconds > 0 ? audioSeconds : 180;
  return {
    hedgeDelayMs: Math.round(Math.min(60_000, Math.max(12_000, 8_000 + seconds * 60))),
    callTimeoutMs: Math.round(Math.min(230_000, Math.max(40_000, 20_000 + seconds * 150))),
  };
}
