"use client";

import { use } from "react";
import { GoalDetailPage } from "@/components/study/pages/goal-detail";

export default function StudyGoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = use(params);
  return <GoalDetailPage goalId={decodeURIComponent(goalId)} />;
}
