const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6,
  10, 15, 21,
];

const SINE_TABLE = (() => {
  const table = new Uint32Array(64);
  for (let index = 0; index < 64; index += 1) {
    table[index] = Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296);
  }
  return table;
})();

function rotateLeft(value: number, amount: number): number {
  return (value << amount) | (value >>> (32 - amount));
}

function toLittleEndianHex(value: number): string {
  let out = "";
  for (let index = 0; index < 4; index += 1) {
    out += ((value >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return out;
}

export function md5Hex(input: Uint8Array): string {
  const originalLength = input.length;
  const paddedLength = (((originalLength + 8) >> 6) + 1) << 6;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[originalLength] = 0x80;

  const bitLength = originalLength * 8;
  const low = bitLength >>> 0;
  const high = Math.floor(bitLength / 4294967296);
  for (let index = 0; index < 4; index += 1) {
    bytes[paddedLength - 8 + index] = (low >>> (index * 8)) & 0xff;
    bytes[paddedLength - 4 + index] = (high >>> (index * 8)) & 0xff;
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const chunk = new Int32Array(16);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      chunk[index] =
        bytes[base] | (bytes[base + 1] << 8) | (bytes[base + 2] << 16) | (bytes[base + 3] << 24);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }

      const temp = d;
      d = c;
      c = b;
      const sum = (f + a + SINE_TABLE[index] + chunk[g]) | 0;
      b = (b + rotateLeft(sum, SHIFTS[index])) | 0;
      a = temp;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  return toLittleEndianHex(a0) + toLittleEndianHex(b0) + toLittleEndianHex(c0) + toLittleEndianHex(d0);
}
