"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/i18n/navigation";

export default function StudySyllabusRedirect() {
  return (
    <Suspense fallback={null}>
      <RedirectToSubjects />
    </Suspense>
  );
}

function RedirectToSubjects() {
  const router = useRouter();
  const subject = useSearchParams().get("subject");

  useEffect(() => {
    router.replace(subject ? `/home/study/subjects?subject=${encodeURIComponent(subject)}` : "/home/study/subjects");
  }, [router, subject]);

  return null;
}
