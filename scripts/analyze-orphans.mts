import * as fs from "node:fs";
import * as path from "node:path";

const reportPath = path.resolve(process.cwd(), "scratch/storage-audit-report.json");
const data = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

const orphans: string[] = data.allOrphanNames;
console.log("Total de órfãos:", orphans.length);

const prefixCount: Record<string, number> = {};
for (const o of orphans) {
  const parts = o.split("/");
  // ex: workspaces / ws_id / notion / job_id / file
  // ex: workspaces / ws_id / uploads / page_id / file
  const prefix = parts.slice(0, 4).join("/");
  prefixCount[prefix] = (prefixCount[prefix] || 0) + 1;
}

console.log("\nDistribuição de órfãos por prefixo:");
for (const [prefix, count] of Object.entries(prefixCount)) {
  console.log(` - ${prefix}: ${count} arquivos`);
}
