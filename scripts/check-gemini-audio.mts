/**
 * Mede a disponibilidade real de cada modelo do Gemini para ÁUDIO.
 *
 * Existe porque "não transcreve" tem causas diferentes que se parecem na tela:
 * cota esgotada (429) só naquele modelo, congestionamento (503), modelo
 * aposentado (404) ou arquivo pesado demais. O script manda texto, 3 s de
 * áudio e 3 min de áudio para cada modelo e imprime status e tempo — é o que
 * define a ordem de `src/lib/ai/transcribe-models.ts`.
 *
 * Gasta um punhado de requisições da chave em `.env.local`. Rode com
 * `npm run check:gemini-audio` quando a transcrição parar de funcionar.
 */
import fs from "node:fs";

// Le a chave do .env.local sem imprimi-la.
const env = fs.readFileSync(".env.local", "utf-8");
const read = (name: string) =>
  env.split(/\r?\n/).find((l) => l.startsWith(name + "="))?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") || "";

const apiKey = read("GEMINI_API_KEY");
const configured = read("GEMINI_MODEL");
if (!apiKey) throw new Error("GEMINI_API_KEY ausente no .env.local");
console.log("GEMINI_MODEL configurado:", configured || "(vazio)");
console.log("chave:", apiKey.length, "caracteres\n");

function wav(seconds: number, rate = 16000, bits: 8 | 16 = 16): Buffer {
  const samples = rate * seconds;
  const bytesPerSample = bits / 8;
  const data = Buffer.alloc(samples * bytesPerSample);
  for (let i = 0; i < samples; i++) {
    // Tom baixo: arquivo válido, sem fala. O que se mede é aceitação e tempo.
    const wave = Math.sin((i / rate) * 2 * Math.PI * 220);
    if (bits === 8) data.writeUInt8(128 + Math.round(wave * 40), i);
    else data.writeInt16LE(Math.round(wave * 2000), i * 2);
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
  header.writeUInt32LE(rate * bytesPerSample, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function call(model: string, parts: unknown[], label: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    });
    const took = ((Date.now() - started) / 1000).toFixed(1);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = String(body?.error?.message || "").slice(0, 90);
      console.log(`${label.padEnd(22)} ${model.padEnd(24)} ${res.status}  ${took}s  ${msg}`);
      return res.status;
    }
    console.log(`${label.padEnd(22)} ${model.padEnd(24)} 200  ${took}s  OK`);
    return 200;
  } catch (e) {
    const took = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${label.padEnd(22)} ${model.padEnd(24)} ---  ${took}s  ${(e as Error).name}`);
    return 0;
  }
}

// Cada sondagem gasta requisicao do dia (RPD é 20 por modelo flash no plano
// gratuito), entao dá para pedir só os modelos em duvida:
//   npm run check:gemini-audio -- gemini-3.5-flash-lite
const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));
/**
 * Sobe o arquivo pela Files API e transcreve por fileUri, em vez de embutir o
 * base64. É o que decide se uma aula inteira cabe em UMA chamada: o inline
 * tem teto de ~20 MB por requisição, a Files API aceita arquivos grandes e a
 * referência custa quase nada no corpo do pedido.
 */
async function callWithFilesApi(model: string, audio: Buffer, mimeType: string, label: string) {
  const started = Date.now();
  const upload = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(600_000),
      headers: {
        "X-Goog-Upload-Protocol": "raw",
        "X-Goog-Upload-Header-Content-Length": String(audio.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": mimeType,
      },
      body: new Uint8Array(audio),
    }
  );
  if (!upload.ok) {
    const body = await upload.text();
    console.log(`${label.padEnd(22)} upload falhou ${upload.status}: ${body.slice(0, 160)}`);
    return;
  }
  const uploaded = await upload.json();
  let file = uploaded?.file;
  console.log(
    `${label.padEnd(22)} upload OK  ${((Date.now() - started) / 1000).toFixed(1)}s  ` +
      `${(audio.length / 1024 / 1024).toFixed(1)} MB  estado=${file?.state}`
  );

  // PROCESSING: o Gemini ainda está preparando o arquivo; só dá para usar em ACTIVE.
  const uri = file?.uri;
  const name = file?.name;
  while (file?.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 4000));
    const check = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${name}?key=${apiKey}`,
      { signal: AbortSignal.timeout(60_000) }
    );
    file = await check.json();
  }
  if (file?.state !== "ACTIVE") {
    console.log(`${label.padEnd(22)} arquivo nao ficou ACTIVE: ${file?.state} ${file?.error?.message || ""}`);
    return;
  }
  console.log(`${label.padEnd(22)} pronto em ${((Date.now() - started) / 1000).toFixed(1)}s, transcrevendo...`);

  const genStarted = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(900_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: "Transcribe all spoken content. Return only the text." },
              { fileData: { mimeType, fileUri: uri } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
      }),
    }
  );
  const took = ((Date.now() - genStarted) / 1000).toFixed(1);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.log(`${label.padEnd(22)} ${model.padEnd(24)} ${res.status}  ${took}s  ${String(data?.error?.message || "").slice(0, 110)}`);
    return;
  }
  const usage = data?.usageMetadata;
  const finish = data?.candidates?.[0]?.finishReason;
  console.log(
    `${label.padEnd(22)} ${model.padEnd(24)} 200  ${took}s  ` +
      `tokens entrada=${usage?.promptTokenCount} saida=${usage?.candidatesTokenCount} fim=${finish}`
  );
}

const models = (
  requested.length > 0
    ? requested
    : [
        configured || "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.6-flash",
        "gemini-flash-lite-latest",
      ]
).filter((m, i, a) => a.indexOf(m) === i);

const prompt = { text: "Transcribe all spoken content. Return only the text." };

if (requested.length === 0) {
  console.log("--- texto puro (linha de base) ---");
  await call(models[0], [{ text: "Diga apenas: ok" }], "texto");
  console.log("");
}

console.log("\n--- áudio de 3 s (WAV) ---");
const small = wav(3).toString("base64");
const smallOk: string[] = [];
for (const m of models) {
  const status = await call(m, [prompt, { inlineData: { mimeType: "audio/wav", data: small } }], "áudio 3s");
  if (status === 200) smallOk.push(m);
}

// --files-api: sobe UM arquivo longo e transcreve por referencia.
if (process.argv.includes("--files-api")) {
  const seconds = Number(
    process.argv.find((a) => a.startsWith("--dur="))?.slice(6) || 3000
  );
  // 8 kHz / 8 bits mantem o upload pequeno: o que se testa aqui e a DURACAO
  // aceita numa chamada so, e o custo em tokens depende do tempo, nao do peso.
  const long = wav(seconds, 8000, 8);
  console.log(`
--- Files API: ${Math.round(seconds / 60)} min em UMA chamada ---`);
  for (const m of models) {
    await callWithFilesApi(m, long, "audio/wav", `files ${Math.round(seconds / 60)}min`);
  }
} else if (smallOk.length > 0) {
  console.log("\n--- áudio de 3 min (WAV ~5,8 MB) ---");
  const big = wav(180).toString("base64");
  for (const m of smallOk.slice(0, 2)) {
    await call(m, [prompt, { inlineData: { mimeType: "audio/wav", data: big } }], "áudio 3min");
  }
} else {
  console.log("\nNenhum modelo aceitou nem 3 s de áudio: o problema não é o tamanho do arquivo.");
}
