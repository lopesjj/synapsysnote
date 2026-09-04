"use client";

import { use } from "react";
import { NotebookView } from "@/components/page/notebook-view";

export default function NotebookRoute({
  params,
}: {
  params: Promise<{ notebookId: string }>;
}) {
  const { notebookId } = use(params);
  return <NotebookView key={notebookId} notebookId={notebookId} />;
}
