import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  adminAuth,
  adminDb,
  adminBucket,
  isAdminConfigured,
} from "../src/lib/firebase/admin";

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
  const db = adminDb();
  const bucket = adminBucket();

  const userDoc = await db.collection("users").doc(user.uid).get();
  const profile = userDoc.exists ? userDoc.data() : null;

  const workspacesSnap = await db.collection("workspaces").get();
  const userWorkspaces: Array<Record<string, unknown>> = [];

  for (const wsDoc of workspacesSnap.docs) {
    const wsId = wsDoc.id;
    const wsData = wsDoc.data();
    const isOwner = wsData.ownerId === user.uid;
    const memberDoc = await wsDoc.ref.collection("members").doc(user.uid).get();

    if (!isOwner && !memberDoc.exists) continue;

    const [pagesSnap, notebooksSnap, flashcardsSnap, databasesSnap] = await Promise.all([
      wsDoc.ref.collection("pages").get(),
      wsDoc.ref.collection("notebooks").get(),
      wsDoc.ref.collection("flashcards").get(),
      wsDoc.ref.collection("databases").get(),
    ]);

    const pagesWithVersions = await Promise.all(
      pagesSnap.docs.map(async (pDoc) => {
        const pData = pDoc.data();
        const vSnap = await pDoc.ref.collection("versions").get();
        const versions = vSnap.docs.map((v) => ({ id: v.id, ...v.data() }));
        return { id: pDoc.id, ...pData, versions };
      })
    );

    const databasesWithRows = await Promise.all(
      databasesSnap.docs.map(async (dDoc) => {
        const dData = dDoc.data();
        const rSnap = await dDoc.ref.collection("rows").get();
        const rows = rSnap.docs.map((r) => ({ id: r.id, ...r.data() }));
        return { id: dDoc.id, ...dData, rows };
      })
    );

    userWorkspaces.push({
      id: wsId,
      metadata: wsData,
      isOwner,
      memberInfo: memberDoc.exists ? memberDoc.data() : null,
      pages: pagesWithVersions,
      notebooks: notebooksSnap.docs.map((n) => ({ id: n.id, ...n.data() })),
      flashcards: flashcardsSnap.docs.map((f) => ({ id: f.id, ...f.data() })),
      databases: databasesWithRows,
    });
  }

  let storageFiles: Array<{ name: string; size: number; updated: string }> = [];
  try {
    const [userFiles] = await bucket.getFiles({ prefix: `users/${user.uid}/` });
    for (const ws of userWorkspaces) {
      if (ws.isOwner) {
        const [wsFiles] = await bucket.getFiles({ prefix: `workspaces/${ws.id}/` });
        userFiles.push(...wsFiles);
      }
    }
    storageFiles = userFiles.map((f) => ({
      name: f.name,
      size: Number(f.metadata.size || 0),
      updated: String(f.metadata.updated || ""),
    }));
  } catch {}

  const payload = {
    exportedAt: new Date().toISOString(),
    auth: {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      disabled: user.disabled,
      createdAt: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
    },
    profile,
    workspaces: userWorkspaces,
    storageFiles,
  };

  const finalPath =
    outputPath || resolve(process.cwd(), `account-export-${user.uid}-${Date.now()}.json`);
  writeFileSync(finalPath, JSON.stringify(payload, null, 2), "utf-8");
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
  const db = adminDb();
  const auth = adminAuth();
  const bucket = adminBucket();

  const userDocRef = db.collection("users").doc(user.uid);
  const workspacesSnap = await db.collection("workspaces").get();

  const ownedWorkspaces: string[] = [];
  const memberWorkspaces: string[] = [];
  const refsToDelete: FirebaseFirestore.DocumentReference[] = [userDocRef];

  for (const wsDoc of workspacesSnap.docs) {
    const wsId = wsDoc.id;
    const wsData = wsDoc.data();
    const isOwner = wsData.ownerId === user.uid;
    const memberRef = wsDoc.ref.collection("members").doc(user.uid);
    const memberDoc = await memberRef.get();

    if (isOwner) {
      ownedWorkspaces.push(wsId);
      refsToDelete.push(wsDoc.ref);

      const [pagesSnap, notebooksSnap, flashcardsSnap, databasesSnap, mediaSnap, allMembersSnap] =
        await Promise.all([
          wsDoc.ref.collection("pages").get(),
          wsDoc.ref.collection("notebooks").get(),
          wsDoc.ref.collection("flashcards").get(),
          wsDoc.ref.collection("databases").get(),
          wsDoc.ref.collection("trashed_media").get(),
          wsDoc.ref.collection("members").get(),
        ]);

      for (const p of pagesSnap.docs) {
        refsToDelete.push(p.ref);
        const vSnap = await p.ref.collection("versions").get();
        for (const v of vSnap.docs) refsToDelete.push(v.ref);
      }

      for (const n of notebooksSnap.docs) refsToDelete.push(n.ref);
      for (const f of flashcardsSnap.docs) refsToDelete.push(f.ref);
      for (const m of mediaSnap.docs) refsToDelete.push(m.ref);
      for (const mem of allMembersSnap.docs) refsToDelete.push(mem.ref);

      for (const d of databasesSnap.docs) {
        refsToDelete.push(d.ref);
        const rSnap = await d.ref.collection("rows").get();
        for (const r of rSnap.docs) refsToDelete.push(r.ref);
      }
    } else if (memberDoc.exists) {
      memberWorkspaces.push(wsId);
      refsToDelete.push(memberRef);
    }
  }

  if (!confirm) {
    console.log(`[SIMULAÇÃO] Exclusão da conta ${user.email} (${user.uid}):`);
    console.log(`- Documentos no Firestore a remover: ${refsToDelete.length}`);
    console.log(`- Espaços de trabalho exclusivos a remover: ${ownedWorkspaces.length} (${ownedWorkspaces.join(", ") || "nenhum"})`);
    console.log(`- Participações como membro a remover: ${memberWorkspaces.length}`);
    console.log(`- Arquivos no Storage sob prefixo users/${user.uid}/ e workspaces exclusivos.`);
    console.log(`- Conta no Firebase Authentication.`);
    console.log(`- AVISO: Registros de acesso (access_logs) serão MANTIDOS pelo prazo do Marco Civil da Internet.`);
    console.log("\nPara efetivar a exclusão irreversível, execute o comando com a flag --confirm.");
    return;
  }

  for (let i = 0; i < refsToDelete.length; i += 400) {
    const batch = db.batch();
    for (const ref of refsToDelete.slice(i, i + 400)) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  try {
    await bucket.deleteFiles({ prefix: `users/${user.uid}/` });
  } catch {}

  for (const wsId of ownedWorkspaces) {
    try {
      await bucket.deleteFiles({ prefix: `workspaces/${wsId}/` });
    } catch {}
  }

  await auth.deleteUser(user.uid);

  console.log(`Exclusão definitiva da conta ${user.email} (${user.uid}) realizada com sucesso.`);
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
