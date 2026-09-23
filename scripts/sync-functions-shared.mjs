import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["retention.ts", "purge-core.ts"];
const check = process.argv.includes("--check");
const targetDir = resolve(root, "functions/src/shared");
let stale = 0;

for (const name of files) {
  const source = readFileSync(resolve(root, "src/lib/trash", name), "utf8");
  const target = resolve(targetDir, name);
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current === source) continue;
  if (check) {
    console.error(`functions/src/shared/${name} difere de src/lib/trash/${name}`);
    stale += 1;
    continue;
  }
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, source);
  console.log(`sincronizado functions/src/shared/${name}`);
}

if (stale) {
  console.error("Rode: node scripts/sync-functions-shared.mjs");
  process.exit(1);
}
if (check) console.log("functions/src/shared em dia");
