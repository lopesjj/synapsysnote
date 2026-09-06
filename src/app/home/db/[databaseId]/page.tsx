"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/data/provider";
import { DatabaseView } from "@/components/database/database-view";
import { Button } from "@/components/ui/button";

export default function DatabaseRoute({ params }: { params: Promise<{ databaseId: string }> }) {
  const { databaseId } = use(params);
  const router = useRouter();
  const { databases, ready } = useWorkspace();
  const database = databases.find((d) => d.id === databaseId);

  if (!database) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium text-ink">
          {ready ? "Base de dados não encontrada" : "Carregando…"}
        </p>
        {ready ? (
          <Button variant="secondary" onClick={() => router.push("/home")}>
            Voltar ao início
          </Button>
        ) : null}
      </div>
    );
  }

  return <DatabaseView database={database} />;
}
