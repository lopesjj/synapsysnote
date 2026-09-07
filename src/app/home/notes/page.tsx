"use client";

import { useSearchParams } from "next/navigation";
import { NotesExplorer } from "@/components/notes/notes-explorer";
import { useWorkspace } from "@/lib/data/provider";

export default function NotesPage() {
  const params = useSearchParams();
  const { notebooks } = useWorkspace();

  const notebookId = params.get("notebook");
  const favoritesOnly = params.get("favorites") === "1";
  const notebook = notebooks.find((candidate) => candidate.id === notebookId);

  return (
    <NotesExplorer
      key={`${notebookId ?? "all"}:${favoritesOnly}`}
      title={favoritesOnly ? "Favoritos" : notebook ? notebook.name : "Todas as notas"}
      scope={{ notebookId, favoritesOnly }}
    />
  );
}
