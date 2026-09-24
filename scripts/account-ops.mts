import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { adminAuth, adminBucket, adminDb, isAdminConfigured } from "../src/lib/firebase/admin";
import { deleteAccount, workspacesOf } from "../src/lib/account/account-server";
import { writeAccountExport } from "../src/lib/account/export-core";

interface ParsedArgs {
  command: "export" | "delete" | "suspend" | null;
  email?: string;
  uid?: string;
  confirm: boolean;
  unsuspend: boolean;
  output?: string;
}

function parseCliArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const command = (args[0] as ParsedArgs["command"]) || null;
  let email: string | undefined;
  let uid: string | undefined;
  let output: string | undefined;
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
    } else if (arg === "--confirm") {
      confirm = true;
    } else if (arg === "--unsuspend") {
      unsuspend = true;
    }
  }

  return { command, email, uid, confirm, unsuspend, output };
}

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
  const summary = await writeAccountExport(
    { db: adminDb(), auth: adminAuth(), bucket: adminBucket() },
    user.uid,
    createWriteStream(finalPath)
  );
  console.log(`Exportação concluída com sucesso para o arquivo: ${finalPath} (${summary.files} arquivo(s))`);
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

async function main() {
  if (!isAdminConfigured()) {
    console.error("Erro: Firebase Admin não configurado no ambiente local.");
    process.exit(1);
  }

  const { command, email, uid, confirm, unsuspend, output } = parseCliArgs();

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Uso: npm run account:<export|delete|suspend> -- [--email <email> | --uid <uid>] [--confirm] [--unsuspend] [--output <path>]");
    process.exit(0);
  }

  if (!command || !["export", "delete", "suspend"].includes(command)) {
    console.log("Uso: npm run account:<export|delete|suspend> -- [--email <email> | --uid <uid>] [--confirm] [--unsuspend] [--output <path>]");
    process.exit(1);
  }

  const user = await resolveUser(email, uid);

  if (command === "export") {
    await runExport(user, output);
  } else if (command === "suspend") {
    await runSuspend(user, unsuspend, confirm);
  } else if (command === "delete") {
    await runDelete(user, confirm);
  }
}

main().catch((err) => {
  console.error("Erro na operação:", err);
  process.exit(1);
});
