"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { usePlanMetrics } from "@/lib/study/hooks";
import { performanceBand } from "@/lib/study/metrics";
import { capitalizeFirst, diffDays } from "@/lib/study/dates";
import {
  ConsistencyPanel,
  CountdownPanel,
  DistributionPanel,
  KpiBand,
  NextUpPanel,
  PacePanel,
  RecentActivityPanel,
  RemindersPanel,
  SubjectsTablePanel,
  TodayPlanPanel,
  TodayReviewsPanel,
  WeekChartPanel,
} from "../widgets";
import { StudyEmpty, StudyGate, StudyHeader, StudyPage } from "../ui";
import { SubjectDialog } from "../subject-dialog";

export function StudyOverview() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("nav_overview")}>
      <OverviewBody />
    </StudyGate>
  );
}

function OverviewBody() {
  const { st, duration, locale } = useStudyT();
  const router = useRouter();
  const { activePlan, planSubjects, settings, today } = useStudy();
  const metrics = usePlanMetrics();
  const [subjectOpen, setSubjectOpen] = useState(false);
  if (!activePlan) return null;

  const parts: string[] = [];
  parts.push(
    activePlan.weeklyGoalMinutes
      ? st("overview_lede_week_goal", { time: duration(metrics.weekSeconds), goal: duration(activePlan.weeklyGoalMinutes * 60) })
      : st("overview_lede_week", { time: duration(metrics.weekSeconds) })
  );
  if (metrics.dueReviews.length) parts.push(st("home_lede_reviews", { count: metrics.dueReviews.length }));
  const weakest = planSubjects
    .map((subject) => ({ subject, agg: metrics.bySubject.get(subject.id) }))
    .filter((entry) => entry.agg && entry.agg.questions >= 10 && performanceBand(entry.agg.accuracy, settings) === "low")
    .sort((a, b) => (a.agg?.accuracy ?? 1) - (b.agg?.accuracy ?? 1))[0];
  if (weakest) parts.push(st("overview_lede_weak", { subject: weakest.subject.name }));
  const examDays = activePlan.examDate ? diffDays(today, activePlan.examDate) : null;
  if (examDays !== null && examDays > 0) parts.push(st("home_lede_exam", { count: examDays }));
  const subtitle = `${capitalizeFirst(new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(parts))}.`;

  return (
    <StudyPage>
      <StudyHeader title={st("nav_overview")} subtitle={planSubjects.length ? subtitle : st("overview_subtitle", { goal: activePlan.name || st("untitled_goal") })} />
      {!planSubjects.length ? (
        <StudyEmpty
          art="subjects"
          title={st("empty_subjects_title")}
          description={st("empty_subjects_desc")}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setSubjectOpen(true)}>
                <Plus />
                {st("empty_subjects_cta")}
              </Button>
              <Button variant="secondary" onClick={() => router.push(`/home/study/goals/${activePlan.id}?bulk=1`)}>
                {st("goal_bulk_subjects")}
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          <KpiBand />
          <div className="hidden lg:block">
            <ConsistencyPanel />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
            <div className="contents lg:col-span-8 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
              <div className="order-4 min-w-0 lg:hidden">
                <ConsistencyPanel />
              </div>
              <div className="order-7 min-w-0 lg:order-none">
                <SubjectsTablePanel />
              </div>
              <div className="order-8 min-w-0 lg:order-none">
                <WeekChartPanel />
              </div>
              <div className="order-9 min-w-0 lg:order-none">
                <DistributionPanel />
              </div>
              <div className="order-11 min-w-0 lg:order-none">
                <RecentActivityPanel />
              </div>
            </div>
            <div className="contents lg:col-span-4 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
              <div className="order-1 min-w-0 lg:order-none">
                <NextUpPanel />
              </div>
              <div className="order-2 min-w-0 lg:order-none">
                <TodayPlanPanel />
              </div>
              <div className="order-3 min-w-0 lg:order-none">
                <TodayReviewsPanel />
              </div>
              <div className="order-5 min-w-0 lg:order-none">
                <CountdownPanel />
              </div>
              <div className="order-6 min-w-0 lg:order-none">
                <PacePanel />
              </div>
              <div className="order-10 min-w-0 lg:order-none">
                <RemindersPanel />
              </div>
            </div>
          </div>
        </div>
      )}
      <SubjectDialog open={subjectOpen} onOpenChange={setSubjectOpen} planId={activePlan.id} />
    </StudyPage>
  );
}
