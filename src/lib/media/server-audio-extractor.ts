import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { GROQ_MAX_UPLOAD_BYTES } from "@/lib/ai/groq-whisper";

const SEGMENT_DURATION_SECONDS = 1800;

function resolveFfmpegBinary(): string | null {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const rawPath = typeof ffmpegPath === "string" ? ffmpegPath : null;

  if (rawPath && !rawPath.startsWith("\\ROOT") && !rawPath.startsWith("/ROOT") && fs.existsSync(rawPath)) {
    return rawPath;
  }

  if (rawPath) {
    const cleaned = rawPath.replace(/^[/\\]ROOT[/\\]?/, "");
    const fromCleaned = path.resolve(process.cwd(), cleaned);
    if (fs.existsSync(fromCleaned)) return fromCleaned;
  }

  const directCwd = path.join(process.cwd(), "node_modules", "ffmpeg-static", binaryName);
  if (fs.existsSync(directCwd)) return directCwd;

  const binCwd = path.join(process.cwd(), "node_modules", ".bin", binaryName);
  if (fs.existsSync(binCwd)) return binCwd;

  return binaryName;
}

function execFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = resolveFfmpegBinary();
    if (!bin) {
      return reject(new Error("FFMPEG_NOT_FOUND"));
    }
    execFile(bin, args, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const bin = resolveFfmpegBinary();
    if (!bin) return resolve(0);
    execFile(bin, ["-i", filePath], (_error, _stdout, stderr) => {
      const match = (stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (!match) return resolve(0);
      const hours = Number(match[1]) || 0;
      const minutes = Number(match[2]) || 0;
      const seconds = Number(match[3]) || 0;
      resolve(hours * 3600 + minutes * 60 + seconds);
    });
  });
}

export async function extractAudioTrack(
  inputBuffer: Buffer,
  mimeType: string
): Promise<{ buffers: Buffer[]; mime: string }> {
  const isMp3 =
    mimeType.includes("mp3") ||
    mimeType.includes("mpeg") ||
    (inputBuffer.length > 3 && inputBuffer.toString("ascii", 0, 3) === "ID3") ||
    (inputBuffer.length > 2 && inputBuffer[0] === 0xff && (inputBuffer[1] & 0xe0) === 0xe0);
  const isWav =
    mimeType.includes("wav") ||
    (inputBuffer.length > 4 && inputBuffer.toString("ascii", 0, 4) === "RIFF");
  const isFlac =
    mimeType.includes("flac") ||
    (inputBuffer.length > 4 && inputBuffer.toString("ascii", 0, 4) === "fLaC");
  const isWebm =
    mimeType.includes("webm") ||
    (inputBuffer.length > 4 && inputBuffer[0] === 0x1a && inputBuffer[1] === 0x45 && inputBuffer[2] === 0xdf && inputBuffer[3] === 0xa3);
  const isOgg =
    mimeType.includes("ogg") ||
    mimeType.includes("opus") ||
    (inputBuffer.length > 4 && inputBuffer.toString("ascii", 0, 4) === "OggS");
  const isMp4 =
    mimeType.includes("mp4") ||
    mimeType.includes("m4a") ||
    mimeType.includes("aac") ||
    (inputBuffer.length > 8 && inputBuffer.toString("ascii", 4, 8) === "ftyp");
  const isVideo = mimeType.startsWith("video/") || (isMp4 && !mimeType.includes("m4a") && !mimeType.includes("aac")) || isWebm;

  if (!isVideo && inputBuffer.byteLength <= GROQ_MAX_UPLOAD_BYTES) {
    return { buffers: [inputBuffer], mime: mimeType };
  }

  const tempDir = os.tmpdir();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ext = isWebm
    ? ".webm"
    : isOgg
      ? ".ogg"
      : isMp3
        ? ".mp3"
        : isWav
          ? ".wav"
          : isFlac
            ? ".flac"
            : isMp4
              ? (mimeType.includes("m4a") ? ".m4a" : ".mp4")
              : ".mp4";
  const inputPath = path.join(tempDir, `synapsys_in_${id}${ext}`);
  const outputPath = path.join(tempDir, `synapsys_out_${id}.ogg`);
  const generatedFiles: string[] = [inputPath, outputPath];

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);
    await execFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputPath,
    ]);

    const stat = await fs.promises.stat(outputPath);
    if (stat.size <= GROQ_MAX_UPLOAD_BYTES) {
      const audioBuffer = await fs.promises.readFile(outputPath);
      return { buffers: [audioBuffer], mime: "audio/ogg; codecs=opus" };
    }

    const duration = await probeDuration(outputPath);
    if (duration <= 0) {
      const fallback = await fs.promises.readFile(outputPath);
      return { buffers: [fallback], mime: "audio/ogg; codecs=opus" };
    }

    const segments: Buffer[] = [];
    let start = 0;
    let segIdx = 0;
    while (start < duration) {
      const segPath = path.join(tempDir, `synapsys_seg_${id}_${segIdx++}.ogg`);
      generatedFiles.push(segPath);
      await execFfmpeg([
        "-y",
        "-ss",
        String(start),
        "-t",
        String(SEGMENT_DURATION_SECONDS),
        "-i",
        outputPath,
        "-c",
        "copy",
        segPath,
      ]);
      const segBuf = await fs.promises.readFile(segPath);
      segments.push(segBuf);
      start += SEGMENT_DURATION_SECONDS;
    }

    return { buffers: segments, mime: "audio/ogg; codecs=opus" };
  } catch (error) {
    console.warn("[audio-extractor] ffmpeg conversion failed, returning original buffer", error);
    return { buffers: [inputBuffer], mime: mimeType };
  } finally {
    for (const f of generatedFiles) {
      try {
        await fs.promises.unlink(f);
      } catch {}
    }
  }
}
