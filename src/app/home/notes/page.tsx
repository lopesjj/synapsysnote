"use client";

import { useSearchParams } from "next/navigation";
import { NotesExplorer } from "@/components/notes/notes-explorer";
import { useWorkspace } from "@/lib/data/provider";

/**
 * "Todas as notas".
 *
 * `?notebook=` and `?favorites=1` let the sidebar and the command palette deep
 * link into a scoped list without a separate route for each combination.
 */
export default function NotesPage() {
  const params = useSearchParams();
  const { notebooks } = useWorkspace();

  const notebookId = params.get("notebook");
  const favoritesOnly = params.get("favorites") === "1";
  const notebook = notebooks.find((candidate) => candidate.id === notebookId);

  return (
    <NotesExplorer
      // Remount on a scope change so the filters and the text search start
      // fresh instead of carrying the previous notebook's state over.
      key={`${notebookId ?? "all"}:${favoritesOnly}`}
      title={favoritesOnly ? "Favoritos" : notebook ? notebook.name : "Todas as notas"}
      scope={{ notebookId, favoritesOnly }}
    />
  );
}
