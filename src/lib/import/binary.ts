const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
  heic: "image/heic",
  avif: "image/avif",
  emf: "image/emf",
  wmf: "image/wmf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus",
  amr: "audio/amr",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
  enex: "application/xml",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/tiff": "tif",
  "image/heic": "heic",
  "image/avif": "avif",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/opus": "opus",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/html": "html",
  "text/csv": "csv",
};

export function fileExtension(name: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

export function mimeFromName(name: string, fallback = "application/octet-stream"): string {
  return MIME_BY_EXTENSION[fileExtension(name)] ?? fallback;
}

export function extensionForMime(mime: string, fallback = "bin"): string {
  return EXTENSION_BY_MIME[mime.toLowerCase().split(";")[0].trim()] ?? fallback;
}

export function sanitizeFileName(name: string, fallback = "arquivo"): string {
  const forbidden = '\/:*?"<>|';
  let cleaned = "";
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    cleaned += forbidden.includes(char) ? "_" : char;
  }
  const normalized = cleaned.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 120) || fallback;
}

export async function readFileBytes(file: Blob): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

function decodeWith(bytes: Uint8Array, encoding: string): string | null {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return null;
  }
}

export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return decodeWith(bytes.subarray(3), "utf-8") ?? "";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeWith(bytes.subarray(2), "utf-16le") ?? "";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeWith(bytes.subarray(2), "utf-16be") ?? "";
  }

  const utf8 = decodeWith(bytes, "utf-8") ?? "";
  if (utf8.indexOf(REPLACEMENT_CHAR) === -1) return utf8;

  const declared = /charset\s*=\s*["']?([A-Za-z0-9_-]+)/i.exec(utf8.slice(0, 4096))?.[1];
  if (declared && !/utf-?8/i.test(declared)) {
    const alternative = decodeWith(bytes, declared.toLowerCase());
    if (alternative && alternative.indexOf(REPLACEMENT_CHAR) === -1) return alternative;
  }
  const latin = decodeWith(bytes, "windows-1252");
  return latin ?? utf8;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  table["-".charCodeAt(0)] = 62;
  table["_".charCodeAt(0)] = 63;
  return table;
})();

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/\-_=]/g, "");
  let length = clean.length;
  while (length > 0 && clean.charCodeAt(length - 1) === 61) length -= 1;
  const output = new Uint8Array(Math.floor((length * 3) / 4));

  let outIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < length; index += 1) {
    const value = BASE64_LOOKUP[clean.charCodeAt(index)];
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[outIndex++] = (buffer >> bits) & 0xff;
    }
  }
  return outIndex === output.length ? output : output.subarray(0, outIndex);
}

export function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

export function bytesToBlob(bytes: Uint8Array, mimeType: string): Blob {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy], { type: mimeType });
}

export function parseDataUrl(url: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]*)(;[^,]*)?,([\s\S]*)$/.exec(url.trim());
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = (match[2] ?? "").includes("base64");
  const payload = match[3] ?? "";
  try {
    if (isBase64) return { mimeType, bytes: base64ToBytes(payload) };
    return { mimeType, bytes: new TextEncoder().encode(decodeURIComponent(payload)) };
  } catch {
    return null;
  }
}
