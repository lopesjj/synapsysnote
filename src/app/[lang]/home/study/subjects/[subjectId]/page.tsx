"use client";

import { use } from "react";
import { SubjectDetailPage } from "@/components/study/pages/subject-detail";

export default function StudySubjectRoute({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = use(params);
  return <SubjectDetailPage subjectId={decodeURIComponent(subjectId)} />;
}
