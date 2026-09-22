"use client";

import { useSearchParams } from "next/navigation";
import { NotesExplorer } from "@/components/notes/notes-explorer";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";

export default function NotesPage() {
  const params = useSearchParams();
  const { notebooks } = useWorkspace();
  const { t } = useTranslation();

  const notebookId = params.get("notebook");
  const favoritesOnly = params.get("favorites") === "1";
  const notebook = notebooks.find((candidate) => candidate.id === notebookId);

  return (
    <NotesExplorer
      key={`${notebookId ?? "all"}:${favoritesOnly}`}
      title={favoritesOnly ? t("favorites") : notebook ? notebook.name : t("all_notes")}
      scope={{ notebookId, favoritesOnly }}
    />
  );
}

