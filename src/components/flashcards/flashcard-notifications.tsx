"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/lib/i18n/navigation";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import { useFlashcardSettings } from "@/lib/flashcards/use-flashcard-settings";
import {
  minutesFromTime,
  reminderSlot,
  showFlashcardNotification,
} from "@/lib/flashcards/notifications";

const LAST_NOTIFIED_KEY = "synapsys.flashcards.lastNotificationDate";
const CHECK_INTERVAL_MS = 30_000;
const TOAST_DURATION_MS = 20_000;

function readLastSlot(): string | null {
  try {
    return window.localStorage.getItem(LAST_NOTIFIED_KEY);
  } catch {
    return null;
  }
}

function writeLastSlot(slot: string) {
  try {
    window.localStorage.setItem(LAST_NOTIFIED_KEY, slot);
  } catch {}
}

/**
 * Um lembrete por dia. Só volta a valer no mesmo dia se o horário foi movido
 * para depois do último aviso — trazer o horário para mais cedo não repete.
 */
function remindedToday(last: string | null, slot: string, scheduled: number): boolean {
  if (!last) return false;
  if (last === slot) return true;
  if (last.slice(0, 10) !== slot.slice(0, 10)) return false;
  return minutesFromTime(last.slice(11)) >= scheduled;
}

export function FlashcardNotificationsWatcher() {
  const { dueFlashcards, flashcardsReady } = useWorkspace();
  const { t } = useTranslation();
  const { settings, hydrated } = useFlashcardSettings();
  const router = useRouter();

  const [tick, setTick] = useState(0);
  const firedRef = useRef<string | null>(null);

  // Abas em segundo plano têm o timer desacelerado; voltar à aba confere na hora.
  useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    const timer = window.setInterval(bump, CHECK_INTERVAL_MS);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  useEffect(() => {
    // Sem a primeira carga dos cards a contagem ainda não é confiável.
    if (!hydrated || !flashcardsReady) return;
    if (!settings.enableNotifications) return;

    const scheduled = minutesFromTime(settings.notificationTime);
    if (scheduled < 0) return;

    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() < scheduled) return;

    const slot = reminderSlot(settings.notificationTime, now);
    if (firedRef.current === slot) return;

    firedRef.current = slot;
    if (remindedToday(readLastSlot(), slot, scheduled)) return;
    writeLastSlot(slot);

    // Nada pendente no horário: o dia fica resolvido, e cards criados mais
    // tarde não disparam um lembrete fora de hora.
    if (dueFlashcards.length === 0) return;

    const message = t("due_cards_reminder", { count: dueFlashcards.length });
    const open = () => router.push("/home/flashcards");

    // Com o app em foco basta o aviso interno; fora dele, a notificação do
    // sistema — e o aviso interno fica de reserva se ela não sair.
    const focused = document.visibilityState === "visible" && document.hasFocus();
    const delivered =
      !focused && showFlashcardNotification({ title: t("flashcards"), body: message, onClick: open });

    if (!delivered) {
      toast.info(message, {
        duration: TOAST_DURATION_MS,
        action: { label: t("study_now"), onClick: open },
      });
    }
  }, [
    dueFlashcards.length,
    flashcardsReady,
    hydrated,
    router,
    settings.enableNotifications,
    settings.notificationTime,
    t,
    tick,
  ]);

  return null;
}
