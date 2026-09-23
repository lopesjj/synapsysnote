import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = resolve(root, "public/vendor");

const copies = [
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs"],
  ["node_modules/katex/dist/katex.min.css", "katex/katex.min.css"],
  ["node_modules/katex/dist/fonts", "katex/fonts"],
];

for (const [from, to] of copies) {
  const source = resolve(root, from);
  if (!existsSync(source)) {
    console.error(`copy-vendor: ${from} não encontrado`);
    process.exit(1);
  }
  const target = resolve(vendor, to);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}
console.log("copy-vendor: pdf.js e KaTeX copiados para public/vendor");
