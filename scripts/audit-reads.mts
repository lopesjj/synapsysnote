/**
 * Mede o custo de leitura de uma abertura "fria" do workspace.
 *
 * Todas as assinaturas do app são de coleção inteira, sem `limit`: o resultado
 * de cada uma é a coleção toda. Então o número de documentos por coleção É o
 * número de leituras cobradas quando o listener reconecta depois de 30 min
 * (regra do Firestore para listener desconectado).
 *
 * Usa agregação `count()`, que custa ~1 leitura a cada 1000 documentos — ou
 * seja, medir é ~1000x mais barato que uma abertura do app.
 *
 *   npx tsx --conditions=react-server scripts/audit-reads.mts
 */
import { adminDb, isAdminConfigured } from "../src/lib/firebase/admin";

/** Assinadas por `StudyProvider`, montado no layout de /home (todo o workspace). */
const STUDY = [
  "study_plans",
  "study_subjects",
  "study_sessions",
  "study_reviews",
  "study_exams",
  "study_cycles",
  "study_reminders",
  "study_meta",
] as const;

/** `study_stickies` só entra quando o bloco de notas é aberto. */
const STUDY_LAZY = ["study_stickies"] as const;

/** Assinadas pelo adaptador de notas (`firestore-adapter.ts`). */
const NOTES = ["notebooks", "pages", "databases", "import_jobs", "flashcards"] as const;

const SCOPED = new Set<string>(["study_sessions", "study_reviews", "study_exams"]);
const isScoped = (name: string) => SCOPED.has(name);

type Row = { workspace: string; collection: string; docs: number; group: string; scoped: number };

async function countOf(path: FirebaseFirestore.CollectionReference): Promise<number> {
  const snap = await path.count().get();
  return snap.data().count;
}

async function main() {
  if (!isAdminConfigured()) {
    console.error("Credencial do Admin SDK não encontrada. Deixe o JSON do service account na raiz ou aponte GOOGLE_APPLICATION_CREDENTIALS.");
    process.exit(1);
  }
  const db = adminDb();
  const workspaces = await db.collection("workspaces").listDocuments();
  if (!workspaces.length) {
    console.log("Nenhum workspace encontrado.");
    return;
  }

  const rows: Row[] = [];
  for (const workspace of workspaces) {
    // Objetivos abertos definem o escopo das coleções grandes.
    const plans = await workspace.collection("study_plans").get();
    const openPlans = plans.docs.filter((entry) => entry.get("archived") !== true).map((entry) => entry.id);

    for (const [group, names] of [
      ["estudos", STUDY],
      ["estudos (preguiçosa)", STUDY_LAZY],
      ["notas", NOTES],
    ] as const) {
      for (const name of names) {
        const total = await countOf(workspace.collection(name));
        if (!total) continue;
        if (!isScoped(name)) {
          rows.push({ workspace: workspace.id, collection: name, docs: total, group, scoped: total });
          continue;
        }
        // Assinatura só dos objetivos abertos: `planId in [...]`, em lotes de 30.
        let scoped = 0;
        for (let start = 0; start < openPlans.length; start += 30) {
          const slice = openPlans.slice(start, start + 30);
          if (!slice.length) continue;
          const snap = await workspace.collection(name).where("planId", "in", slice).count().get();
          scoped += snap.data().count;
        }
        rows.push({ workspace: workspace.id, collection: name, docs: total, group, scoped });
      }
    }
    // Cada base abre um listener próprio para as linhas (N+1).
    const databases = await workspace.collection("databases").listDocuments();
    let rowDocs = 0;
    for (const database of databases) rowDocs += await countOf(database.collection("rows"));
    if (rowDocs) rows.push({ workspace: workspace.id, collection: `databases/*/rows (${databases.length} base(s))`, docs: rowDocs, group: "notas", scoped: rowDocs });
  }

  const byWorkspace = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byWorkspace.get(row.workspace);
    if (list) list.push(row);
    else byWorkspace.set(row.workspace, [row]);
  }

  let grandAll = 0;
  let grandScoped = 0;
  for (const [workspace, list] of byWorkspace) {
    const eager = list.filter((row) => row.group !== "estudos (preguiçosa)");
    const all = eager.reduce((sum, row) => sum + row.docs, 0);
    const scoped = eager.reduce((sum, row) => sum + row.scoped, 0);
    grandAll += all;
    grandScoped += scoped;
    console.log(`\nworkspace ${workspace}`);
    console.log("    coleção inteira    assinado    coleção");
    for (const row of list.sort((a, b) => b.docs - a.docs)) {
      const lazy = row.group === "estudos (preguiçosa)";
      const left = row.docs.toString().padStart(15);
      const right = lazy ? "sob demanda".padStart(11) : row.scoped.toString().padStart(11);
      console.log(`  ${left} ${right}    ${row.collection}`);
    }
    console.log(`  ${all.toString().padStart(15)} ${scoped.toString().padStart(11)}    LEITURAS POR ABERTURA FRIA`);
    const cut = all ? (1 - scoped / all) * 100 : 0;
    console.log(`  corte de ${cut.toFixed(1)}% — ${(50_000 / Math.max(1, all)).toFixed(1)} → ${(50_000 / Math.max(1, scoped)).toFixed(1)} aberturas frias/dia na cota grátis de 50 mil`);
  }

  if (byWorkspace.size > 1) {
    console.log(`\nsoma dos ${byWorkspace.size} workspaces: ${grandAll} → ${grandScoped} leituras por abertura fria`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
