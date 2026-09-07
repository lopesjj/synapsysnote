"use client";

import { use } from "react";
import { NotesExplorer } from "@/components/notes/notes-explorer";

export default function TagRoute({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = use(params);
  const decoded = decodeURIComponent(tag);

  return (
    <NotesExplorer
      title={`#${decoded}`}
      description={`Notas marcadas com “${decoded}”.`}
      scope={{ tag: decoded }}
    />
  );
}
