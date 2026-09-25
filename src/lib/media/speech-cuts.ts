/**
 * Onde fatiar uma gravação longa para transcrever em paralelo.
 *
 * Antes os trechos eram cortados no relógio (a cada 3 min) com 5 s repetidos
 * entre vizinhos, e a emenda tentava achar as palavras em comum para apagar a
 * repetição. Isso perdia fala: a comparação removia tudo que não fosse a-z/0-9,
 * então em árabe, russo, japonês ou chinês toda palavra virava "" e as dez
 * primeiras "palavras" de cada trecho eram descartadas como repetidas — em
 * japonês e chinês, frases inteiras.
 *
 * Cortando numa pausa real não há palavra partida nem trecho repetido, e a
 * emenda vira uma simples concatenação, em qualquer idioma.
 *
 * Funções puras: `verify:transcription` exercita sem navegador.
 */

/** Quadros de 20 ms: fina o bastante para achar a pausa entre duas palavras. */
export const ENERGY_FRAME_SECONDS = 0.02;

/**
 * Energia média (RMS ao quadrado) de cada quadro de 20 ms, lida em blocos para
 * nunca copiar a trilha inteira.
 */
export function frameEnergies(
  read: (startSample: number, out: Float32Array) => number,
  totalSamples: number,
  sampleRate: number
): Float32Array {
  const frame = Math.max(1, Math.round(sampleRate * ENERGY_FRAME_SECONDS));
  const frames = Math.ceil(totalSamples / frame);
  const energies = new Float32Array(frames);
  const framesPerBlock = 500;
  const block = new Float32Array(frame * framesPerBlock);

  for (let f = 0; f < frames; f += framesPerBlock) {
    const got = read(f * frame, block);
    const count = Math.min(framesPerBlock, frames - f);
    for (let k = 0; k < count; k++) {
      let sum = 0;
      const from = k * frame;
      const to = Math.min(got, from + frame);
      for (let i = from; i < to; i++) sum += block[i] * block[i];
      energies[f + k] = to > from ? sum / (to - from) : 0;
    }
  }
  return energies;
}

export interface CutPlanOptions {
  /** Duração alvo de cada trecho, em segundos. */
  targetSeconds: number;
  /** Quanto antes do alvo a pausa pode ser procurada. */
  lookBackSeconds?: number;
  /** Quanto depois do alvo a pausa pode ser procurada. */
  lookAheadSeconds?: number;
  /** Duração da pausa procurada. */
  quietSeconds?: number;
}

/**
 * Pontos de corte, em segundos, escolhendo em volta de cada alvo o trecho de
 * `quietSeconds` com menos energia. Sem pausa nenhuma (música contínua), cai no
 * ponto mais baixo da janela — o pior caso é o mesmo corte no relógio de antes.
 */
export function planSpeechCuts(energies: ArrayLike<number>, options: CutPlanOptions): number[] {
  const fps = 1 / ENERGY_FRAME_SECONDS;
  const total = energies.length;
  const duration = total / fps;
  const target = Math.max(10, options.targetSeconds);
  const lookBack = options.lookBackSeconds ?? Math.min(25, target * 0.15);
  const lookAhead = options.lookAheadSeconds ?? Math.min(10, target * 0.06);
  const quiet = Math.max(1, Math.round((options.quietSeconds ?? 0.4) * fps));

  // Um resto curto no fim vai junto com o último trecho em vez de virar uma
  // chamada à parte para meio minuto de áudio.
  const tailSlack = target * 0.3;
  if (duration <= target + tailSlack) return [];

  const prefix = new Float64Array(total + 1);
  for (let i = 0; i < total; i++) prefix[i + 1] = prefix[i] + (energies[i] || 0);
  const windowEnergy = (startFrame: number) =>
    prefix[Math.min(total, startFrame + quiet)] - prefix[startFrame];

  const cuts: number[] = [];
  let start = 0;
  while (duration - start > target + tailSlack) {
    const ideal = start + target;
    const from = Math.max(Math.round((start + target * 0.5) * fps), Math.round((ideal - lookBack) * fps));
    const to = Math.min(total - quiet, Math.round((ideal + lookAhead) * fps));
    let best = Math.round(ideal * fps);
    let bestEnergy = Number.POSITIVE_INFINITY;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let f = from; f <= to; f++) {
      const energy = windowEnergy(f);
      const distance = Math.abs(f - ideal * fps);
      // Empate (silêncio digital) fica com o mais perto do alvo, para os
      // trechos não encolherem à toa.
      if (energy < bestEnergy - 1e-12 || (Math.abs(energy - bestEnergy) <= 1e-12 && distance < bestDistance)) {
        bestEnergy = energy;
        bestDistance = distance;
        best = f;
      }
    }
    // Corta no meio da pausa.
    const cut = (best + quiet / 2) / fps;
    if (cut <= start + 1) break;
    cuts.push(cut);
    start = cut;
  }
  return cuts;
}

/** Os cortes viram faixas [início, fim) em segundos cobrindo a gravação inteira. */
export function rangesFromCuts(cuts: number[], duration: number): { start: number; end: number }[] {
  const points = [0, ...cuts.filter((c) => c > 0 && c < duration), duration];
  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i + 1] > points[i]) ranges.push({ start: points[i], end: points[i + 1] });
  }
  return ranges;
}
