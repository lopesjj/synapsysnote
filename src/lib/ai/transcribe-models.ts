/**
 * Ordem em que os modelos do Gemini são tentados para transcrever.
 *
 * A ordem vem de medição e da cota real do plano, não de palpite. No painel do
 * plano gratuito cada modelo flash tem **20 requisições por dia** e 5 por
 * minuto; o `flash-lite` tem **500 por dia** e 15 por minuto. Uma aula de
 * 50 min são ~18 trechos: cabe folgada no lite e consome o dia inteiro de um
 * flash. Por isso o padrão de transcrição é o lite — medido transcrevendo 3
 * min de áudio em 13,7 s — e os flash ficam de reserva, para quando o lite
 * recusar.
 *
 * Medições que explicam o resto da ordem (`npm run check:gemini-audio`):
 * `gemini-3.5-flash` transcreveu 3 min em 5-7 s (o mais rápido, mas 20/dia);
 * `gemini-3.7-flash` e `gemini-3.8-flash` já apareceram com a cota do dia
 * estourada (23/20 e 21/20); `gemini-2.5-flash-lite` saiu do ar com 404.
 *
 * O apelido `-latest` aponta para o mesmo pool do flash mais novo, então fica
 * perto do fim: tentá-lo logo após um flash recente é entrar duas vezes na
 * mesma fila, que foi o que deixou uma aula de 50 min sem transcrição.
 */
export const TRANSCRIBE_FALLBACK_MODELS = [
  "gemini-3.5-transcribe",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
] as const;

export const DEFAULT_TRANSCRIBE_MODEL = "gemini-3.5-transcribe";

/**
 * A ordem é sempre esta. Houve uma versão que girava a lista a cada tentativa,
 * para não repetir a fila cheia; com a cota medida isso era nocivo, porque
 * empurrava a retentativa para os modelos de 20/dia e jogava o de 500/dia para
 * o fim. Quem evita repetir modelo morto agora é a memória de descanso
 * (`model-cooldown.ts`), que sabe QUAL modelo recusou e por quanto tempo.
 */
export function transcribeModelChain(preferredModel?: string): string[] {
  const preferred = preferredModel?.trim() || DEFAULT_TRANSCRIBE_MODEL;
  return [preferred, ...TRANSCRIBE_FALLBACK_MODELS.filter((m) => m !== preferred)];
}
