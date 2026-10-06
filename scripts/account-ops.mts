import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { adminAuth, isAdminConfigured } from "../src/lib/firebase/admin";
import { accountExportStream, deleteAccount, workspacesOf } from "../src/lib/account/account-server";
import { DAY_MS, PLAN_IDS, isPaidPlan, isPlanId, type PlanId } from "../src/lib/plans/definitions";
import { resolveEntitlements } from "../src/lib/plans/entitlements";
import { listPlanHistory, loadAccountPlan, setAccountPlan } from "../src/lib/plans/server";

const COMMANDS = ["export", "delete", "suspend", "plan"] as const;
type Command = (typeof COMMANDS)[number];

interface ParsedArgs {
  command: Command | null;
  email?: string;
  uid?: string;
  confirm: boolean;
  unsuspend: boolean;
  output?: string;
  plan?: string;
  until?: string;
  trialDays?: string;
  note?: string;
}

function parseCliArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const command = (COMMANDS as readonly string[]).includes(args[0]) ? (args[0] as Command) : null;
  let email: string | undefined;
  let uid: string | undefined;
  let output: string | undefined;
  let plan: string | undefined;
  let until: string | undefined;
  let trialDays: string | undefined;
  let note: string | undefined;
  let confirm = false;
  let unsuspend = false;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--email" && args[i + 1]) {
      email = args[++i].trim();
    } else if (arg === "--uid" && args[i + 1]) {
      uid = args[++i].trim();
    } else if (arg === "--output" && args[i + 1]) {
      output = args[++i].trim();
    } else if (arg === "--set" && args[i + 1]) {
      plan = args[++i].trim().toLowerCase();
    } else if (arg === "--until" && args[i + 1]) {
      until = args[++i].trim();
    } else if (arg === "--trial-days" && args[i + 1]) {
      trialDays = args[++i].trim();
    } else if (arg === "--note" && args[i + 1]) {
      note = args[++i];
    } else if (arg === "--confirm") {
      confirm = true;
    } else if (arg === "--unsuspend") {
      unsuspend = true;
    }
  }

  return { command, email, uid, confirm, unsuspend, output, plan, until, trialDays, note };
}

const USAGE = [
  "Uso: npm run account:<export|delete|suspend|plan> -- [--email <email> | --uid <uid>] [opções]",
  "  export   [--output <arquivo.zip>]",
  "  delete   [--confirm]",
  "  suspend  [--unsuspend] [--confirm]",
  `  plan     [--set <${PLAN_IDS.join("|")}>] [--until AAAA-MM-DD] [--trial-days N] [--note "texto"] [--confirm]`,
  "           Sem --set, só mostra o plano atual e o histórico.",
].join("\n");

async function resolveUser(email?: string, uid?: string) {
  const auth = adminAuth();
  if (uid) {
    return await auth.getUser(uid);
  }
  if (email) {
    return await auth.getUserByEmail(email);
  }
  throw new Error("E-mail ou UID deve ser informado via --email ou --uid.");
}

async function runExport(user: Awaited<ReturnType<typeof resolveUser>>, outputPath?: string) {
  const finalPath =
    outputPath || resolve(process.cwd(), `account-export-${user.uid}-${Date.now()}.zip`);
  const reader = accountExportStream(user.uid).getReader();
  const out = createWriteStream(finalPath);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!out.write(value)) await new Promise((resolveDrain) => out.once("drain", resolveDrain));
  }
  await new Promise<void>((resolveEnd, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolveEnd())));
  console.log(`Exportação concluída com sucesso para o arquivo: ${finalPath}`);
}

async function runSuspend(user: Awaited<ReturnType<typeof resolveUser>>, unsuspend: boolean, confirm: boolean) {
  const auth = adminAuth();
  const nextState = !unsuspend;

  if (!confirm) {
    console.log(`[SIMULAÇÃO] Usuário ${user.email} (${user.uid}) seria alterado para disabled=${nextState}.`);
    console.log("Para efetivar a operação, execute o comando com a flag --confirm.");
    return;
  }

  await auth.updateUser(user.uid, { disabled: nextState });
  if (nextState) {
    await auth.revokeRefreshTokens(user.uid);
  }

  console.log(
    `Sucesso: Conta ${user.email} (${user.uid}) foi ${nextState ? "suspensa" : "reativada"}.`
  );
}

async function runDelete(user: Awaited<ReturnType<typeof resolveUser>>, confirm: boolean) {
  if (!confirm) {
    const { owned, member } = await workspacesOf(user.uid);
    console.log(`[SIMULAÇÃO] Exclusão da conta ${user.email} (${user.uid}):`);
    console.log(`- Workspaces exclusivos apagados por inteiro (com subcoleções e arquivos): ${owned.map((ref) => ref.id).join(", ") || "nenhum"}`);
    console.log(`- Participações como membro removidas: ${member.length}`);
    console.log("- Tokens do Notion, Google Docs e Evernote revogados antes da exclusão.");
    console.log(`- Perfil users/${user.uid}, arquivos users/${user.uid}/ e a conta no Firebase Authentication.`);
    console.log("- AVISO: Registros de acesso (access_logs) serão MANTIDOS pelo prazo do Marco Civil da Internet.");
    console.log("\nPara efetivar a exclusão irreversível, execute o comando com a flag --confirm.");
    return;
  }
  const summary = await deleteAccount(user.uid);
  console.log(`Exclusão definitiva da conta ${user.email} (${user.uid}) realizada com sucesso.`, summary);
}

function formatDate(value: number | null): string {
  return value === null ? "—" : new Date(value).toISOString().slice(0, 10);
}

function endOfDayUtc(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T23:59:59.999Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

async function runPlan(user: Awaited<ReturnType<typeof resolveUser>>, args: ParsedArgs) {
  const current = await loadAccountPlan(user.uid);
  const now = Date.now();
  const status = resolveEntitlements(current, now);
  console.log(`Conta: ${user.email} (${user.uid})`);
  if (current) {
    console.log(`Plano atual: ${current.plan} · situação: ${status.status}${status.readOnly ? " (somente leitura)" : ""}`);
    console.log(`Teste: ${formatDate(current.trialStartedAt)} → ${formatDate(current.trialEndsAt)} · validade: ${formatDate(current.expiresAt)}`);
  } else {
    console.log("Plano atual: nenhum registro ainda (o teste começa no primeiro acesso).");
  }

  if (!args.plan) {
    const history = await listPlanHistory(user.uid, 10);
    for (const entry of history) {
      console.log(
        `  ${new Date(entry.at).toISOString()} · ${entry.from?.plan ?? "—"} → ${entry.to.plan} · ${entry.source}${entry.byEmail ? ` · ${entry.byEmail}` : ""}${entry.note ? ` · ${entry.note}` : ""}`
      );
    }
    return;
  }

  if (!isPlanId(args.plan)) throw new Error(`Plano inválido: ${args.plan}. Use ${PLAN_IDS.join(", ")}.`);
  const plan: PlanId = args.plan;

  let expiresAt: number | null = null;
  if (args.until) {
    if (!isPaidPlan(plan)) throw new Error("--until só vale para os planos basic, pro e ultra.");
    expiresAt = endOfDayUtc(args.until);
    if (expiresAt === null || expiresAt <= now) throw new Error("--until precisa ser uma data futura no formato AAAA-MM-DD.");
  }

  let trialEndsAt: number | undefined;
  if (args.trialDays !== undefined) {
    const days = Number(args.trialDays);
    if (!Number.isInteger(days) || days < 0 || days > 3650) throw new Error("--trial-days precisa ser um inteiro entre 0 e 3650.");
    trialEndsAt = now + days * DAY_MS;
  }

  const summary = `${current?.plan ?? "—"} → ${plan} · validade ${formatDate(expiresAt)}${trialEndsAt !== undefined ? ` · teste até ${formatDate(trialEndsAt)}` : ""}`;
  if (!args.confirm) {
    console.log(`[SIMULAÇÃO] ${summary}`);
    console.log("Para efetivar a alteração, execute o comando com a flag --confirm.");
    return;
  }

  const next = await setAccountPlan(
    user.uid,
    { plan, expiresAt, trialEndsAt, note: args.note },
    { uid: null, email: null, source: "cli" },
    { identity: { email: user.email ?? "", emailVerified: user.emailVerified } }
  );
  const after = resolveEntitlements(next, Date.now());
  console.log(`Sucesso: ${summary}. Situação agora: ${after.status}${after.readOnly ? " (somente leitura)" : ""}.`);
}

async function main() {
  if (!isAdminConfigured()) {
    console.error("Erro: Firebase Admin não configurado no ambiente local.");
    process.exit(1);
  }

  const args = parseCliArgs();
  const { command, email, uid, confirm, unsuspend, output } = args;

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!command) {
    console.log(USAGE);
    process.exit(1);
  }

  const user = await resolveUser(email, uid);

  if (command === "export") {
    await runExport(user, output);
  } else if (command === "suspend") {
    await runSuspend(user, unsuspend, confirm);
  } else if (command === "delete") {
    await runDelete(user, confirm);
  } else if (command === "plan") {
    await runPlan(user, args);
  }
}

main().catch((err) => {
  console.error("Erro na operação:", err);
  process.exit(1);
});
