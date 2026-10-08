"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "@/lib/i18n/navigation";
import { hydrateStudyUiSync, isStudyPath, useStudyUi } from "@/lib/study/ui-store";
import { useTranslation } from "@/lib/i18n/translations";
import { loadStudyDictionary } from "@/lib/study/i18n/dictionaries";
import { FocusEngine, TimerTitle } from "./focus-timer";

/**
 * Esta camada é montada no layout do workspace, ou seja, em toda página —
 * inclusive nas de notas, onde nada disto aparece. Cada peça abaixo só é
 * baixada quando abre de verdade; o que fica no pacote de todo mundo é só o
 * motor do relógio, que precisa continuar contando onde quer que se esteja.
 */
const FocusOverlay = dynamic(() => import("./focus-overlay").then((module) => module.FocusOverlay));
const LogSessionDialog = dynamic(() => import("./log-session-dialog").then((module) => module.LogSessionDialog));
const TimerExamDialog = dynamic(() => import("./exam-dialog").then((module) => module.TimerExamDialog));
const Scratchpad = dynamic(() => import("./scratchpad").then((module) => module.Scratchpad));

function ModuleTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/home") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("entry") !== "login") return;
    useStudyUi.getState().setModule("notes");
    url.searchParams.delete("entry");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [pathname]);
  useLayoutEffect(() => {
    hydrateStudyUiSync();
  }, []);
  useLayoutEffect(() => {
    if (!pathname?.startsWith("/home") || pathname === "/home") return;
    const store = useStudyUi.getState();
    const next = isStudyPath(pathname) ? "study" : "notes";
    if (store.module !== next) store.setModule(next);
  }, [pathname]);
  return null;
}

/**
 * Fica `true` na primeira vez que a peça abre e não volta atrás. Desmontar ao
 * fechar cortaria a animação de saída do diálogo; o que importa é não baixar o
 * pedaço de quem nunca abriu.
 */
function useMountedOnce(open: boolean): boolean {
  const [used, setUsed] = useState(false);
  if (open && !used) setUsed(true);
  return used;
}

export function StudyLayer() {
  const timerUsed = useMountedOnce(
    useStudyUi((state) => state.timerOpen || state.timer.status !== "idle" || Boolean(state.timer.reviewId))
  );
  const logUsed = useMountedOnce(useStudyUi((state) => state.logOpen));
  const examUsed = useMountedOnce(useStudyUi((state) => state.examOpen));
  const padUsed = useMountedOnce(useStudyUi((state) => state.padOpen));

  // O dicionário do idioma vem em pedaço próprio. Nas páginas de estudo o
  // `StudyGate` espera por ele, mas o relógio e os diálogos também aparecem por
  // cima das notas: sem pedir o dicionário aqui, eles piscariam em português
  // para quem usa outro idioma.
  const { language } = useTranslation();
  const studyInUse = useStudyUi((state) => state.module === "study") || timerUsed || logUsed || examUsed || padUsed;
  useEffect(() => {
    if (studyInUse) loadStudyDictionary(language);
  }, [language, studyInUse]);

  return (
    <>
      <ModuleTracker />
      <FocusEngine />
      <TimerTitle />
      {timerUsed ? <FocusOverlay /> : null}
      {logUsed ? <LogSessionDialog /> : null}
      {examUsed ? <TimerExamDialog /> : null}
      {padUsed ? <Scratchpad /> : null}
    </>
  );
}
