export interface SlicedZipEntry {
  name: string;
  compression: number;
  compSize: number;
  uncompSize: number;
  localHeaderOffset: number;
}

export async function decompressDeflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(compressed as unknown as BufferSource);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function readZipCentralDirectory(
  file: File | { size: number; slice: (s: number, e: number) => Blob | { arrayBuffer: () => Promise<ArrayBuffer> } }
): Promise<Map<string, SlicedZipEntry>> {
  const tailSize = Math.min(65536, file.size);
  const tailBuf = await file.slice(file.size - tailSize, file.size).arrayBuffer();
  const tailBytes = new Uint8Array(tailBuf);
  const tailView = new DataView(tailBuf);

  let eocdOffset = -1;
  for (let i = tailBytes.length - 22; i >= 0; i--) {
    if (
      tailBytes[i] === 0x50 &&
      tailBytes[i + 1] === 0x4b &&
      tailBytes[i + 2] === 0x05 &&
      tailBytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("corrupted_file");
  }

  const cdSize = tailView.getUint32(eocdOffset + 12, true);
  const cdOffset = tailView.getUint32(eocdOffset + 16, true);

  const cdBuf = await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
  const cdView = new DataView(cdBuf);
  const cdBytes = new Uint8Array(cdBuf);
  const entries = new Map<string, SlicedZipEntry>();
  const decoder = new TextDecoder();

  let pos = 0;
  while (pos + 46 <= cdSize) {
    if (cdView.getUint32(pos, true) !== 0x02014b50) break;
    const compression = cdView.getUint16(pos + 10, true);
    const compSize = cdView.getUint32(pos + 20, true);
    const uncompSize = cdView.getUint32(pos + 24, true);
    const nameLen = cdView.getUint16(pos + 28, true);
    const extraLen = cdView.getUint16(pos + 30, true);
    const commentLen = cdView.getUint16(pos + 32, true);
    const localHeaderOffset = cdView.getUint32(pos + 42, true);

    const nameBytes = cdBytes.subarray(pos + 46, pos + 46 + nameLen);
    const name = decoder.decode(nameBytes);

    entries.set(name, {
      name,
      compression,
      compSize,
      uncompSize,
      localHeaderOffset,
    });

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

export async function extractZipEntry(
  file: File | { slice: (s: number, e: number) => Blob | { arrayBuffer: () => Promise<ArrayBuffer> } },
  entry: SlicedZipEntry
): Promise<Uint8Array> {
  const lhBuf = await file.slice(entry.localHeaderOffset, entry.localHeaderOffset + 30).arrayBuffer();
  const lhView = new DataView(lhBuf);
  if (lhView.getUint32(0, true) !== 0x04034b50) {
    throw new Error("corrupted_file");
  }
  const localNameLen = lhView.getUint16(26, true);
  const localExtraLen = lhView.getUint16(28, true);
  const dataOffset = entry.localHeaderOffset + 30 + localNameLen + localExtraLen;

  const dataBuf = await file.slice(dataOffset, dataOffset + entry.compSize).arrayBuffer();
  const rawBytes = new Uint8Array(dataBuf);

  if (entry.compression === 0) {
    return rawBytes;
  }
  if (entry.compression === 8) {
    return decompressDeflateRaw(rawBytes);
  }
  throw new Error(`unsupported_compression_${entry.compression}`);
}

export async function extractZipJson<T = unknown>(
  file: File,
  candidateNames: string[]
): Promise<{ data: T; entries: Map<string, SlicedZipEntry> }> {
  const entries = await readZipCentralDirectory(file);
  let target: SlicedZipEntry | undefined;
  for (const cand of candidateNames) {
    const found = entries.get(cand);
    if (found) {
      target = found;
      break;
    }
  }
  if (!target) {
    const lowerCandidates = candidateNames.map((c) => c.toLowerCase());
    for (const [key, val] of entries.entries()) {
      if (lowerCandidates.includes(key.toLowerCase())) {
        target = val;
        break;
      }
    }
  }

  if (!target) {
    throw new Error("synapsys_import_invalid_file");
  }

  const bytes = await extractZipEntry(file, target);
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as T;
  return { data: parsed, entries };
}
