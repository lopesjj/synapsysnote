"use client";

import { use } from "react";
import { PageView } from "@/components/page/page-view";

export default function PageRoute({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = use(params);
  return <PageView key={pageId} pageId={pageId} />;
}
