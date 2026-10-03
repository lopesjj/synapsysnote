"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "@/lib/i18n/navigation";
import { hydrateStudyUiSync, isStudyPath, useStudyUi } from "@/lib/study/ui-store";
import { FocusEngine, FocusOverlay, TimerTitle } from "./focus-timer";
import { LogSessionDialog } from "./log-session-dialog";
import { Scratchpad } from "./scratchpad";

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

export function StudyLayer() {
  return (
    <>
      <ModuleTracker />
      <FocusEngine />
      <TimerTitle />
      <FocusOverlay />
      <LogSessionDialog />
      <Scratchpad />
    </>
  );
}
