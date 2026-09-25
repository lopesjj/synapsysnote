/**
 * Confere a transcrição pelo Whisper do Groq com a chave do `.env.local`.
 *
 * Manda 5 s e 5 min de áudio sintético (tom, sem fala: o que se mede é se a
 * chave vale, se o formato é aceito e quanto tempo leva) e imprime status,
 * tempo e as cotas restantes que o Groq devolve nos cabeçalhos. Gasta ~5 min
 * da cota de áudio da hora (7.200 s no plano gratuito).
 *
 * Rode com `npm run check:whisper` quando a transcrição parar de funcionar.
 */
import fs from "node:fs";
import { DEFAULT_WHISPER_MODEL, GROQ_TRANSCRIBE_URL } from "../src/lib/ai/groq-whisper";

// Lê a chave do .env.local sem imprimi-la.
const env = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf-8") : "";
const read = (name: string) =>
  process.env[name]?.trim() ||
  env.split(/\r?\n/).find((l) => l.startsWith(name + "="))?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") ||
  "";

const apiKey = read("GROQ_API_KEY");
const model = read("GROQ_TRANSCRIBE_MODEL") || DEFAULT_WHISPER_MODEL;
if (!apiKey) throw new Error("GROQ_API_KEY ausente no .env.local");
console.log("modelo:", model);
console.log("chave:", apiKey.length, "caracteres\n");

function wav(seconds: number, rate = 16000): Buffer {
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 2000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function check(label: string, seconds: number) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav(seconds))], { type: "audio/wav" }), "audio.wav");
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  const started = Date.now();
  try {
    const res = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const took = ((Date.now() - started) / 1000).toFixed(1);
    const body = await res.json().catch(() => null);
    const detail = res.ok
      ? `idioma=${body?.language ?? "?"} segmentos=${body?.segments?.length ?? 0}`
      : String(body?.error?.message || "").slice(0, 140);
    console.log(`${label.padEnd(10)} ${res.status}  ${took}s  ${detail}`);
    const remaining = ["x-ratelimit-remaining-requests", "x-ratelimit-remaining-audio-seconds"]
      .map((name) => `${name.replace("x-ratelimit-remaining-", "")}=${res.headers.get(name) ?? "?"}`)
      .join("  ");
    console.log(`           restante: ${remaining}`);
  } catch (error) {
    console.log(`${label.padEnd(10)} ---  ${((Date.now() - started) / 1000).toFixed(1)}s  ${(error as Error).message}`);
  }
}

await check("5 s", 5);
await check("5 min", 300);
