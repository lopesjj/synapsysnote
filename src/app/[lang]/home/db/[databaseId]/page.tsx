"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/data/provider";
import { DatabaseView } from "@/components/database/database-view";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/translations";

export default function DatabaseRoute({ params }: { params: Promise<{ databaseId: string }> }) {
  const { databaseId } = use(params);
  const router = useRouter();
  const { t } = useTranslation();
  const { databases, ready } = useWorkspace();
  const database = databases.find((d) => d.id === databaseId);

  if (!database) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium text-ink">
          {ready ? t("db_not_found") : t("loading")}
        </p>
        {ready ? (
          <Button variant="secondary" onClick={() => router.push("/home")}>
            {t("back_to_home")}
          </Button>
        ) : null}
      </div>
    );
  }

  return <DatabaseView database={database} />;
}
