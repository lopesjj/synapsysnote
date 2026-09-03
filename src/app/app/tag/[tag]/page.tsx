"use client";

import { use } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/data/provider";
import { EmptyState } from "@/components/ui/primitives";
import { formatRelative, truncate } from "@/lib/utils";

export default function TagRoute({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = use(params);
  const decoded = decodeURIComponent(tag);
  const { livePages } = useWorkspace();
  const pages = livePages.filter((page) => page.tags.includes(decoded));

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{decoded}</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        {pages.length} {pages.length === 1 ? "página marcada" : "páginas marcadas"} com esta tag.
      </p>

      <div className="mt-6 space-y-2">
        {pages.length ? (
          pages.map((page) => (
            <Link
              key={page.id}
              href={`/app/p/${page.id}`}
              className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 transition hover:border-[var(--accent)]/50"
            >
              <span className="text-base">{page.icon ?? "📄"}</span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{page.title}</p>
                <p className="line-clamp-1 text-[11.5px] text-muted">
                  {truncate(page.plainText.replace(/\n/g, " "), 120)}
                </p>
              </div>
              <span className="ml-auto shrink-0 text-[11px] text-faint">
                {formatRelative(page.updatedAt)}
              </span>
            </Link>
          ))
        ) : (
          <EmptyState title="Nenhuma página com esta tag" description="Adicione a tag em uma página para vê-la aqui." />
        )}
      </div>
    </div>
  );
}
