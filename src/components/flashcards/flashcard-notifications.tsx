"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
const CHECK_INTERVAL_MS = 60_000;

export function FlashcardNotificationsWatcher() {
  const { dueFlashcards } = useWorkspace();
  const { t } = useTranslation();
  const { settings, hydrated } = useFlashcardSettings();
  const router = useRouter();

  const [tick, setTick] = useState(0);
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!settings.enableNotifications) return;
    if (dueFlashcards.length === 0) return;

    const scheduled = minutesFromTime(settings.notificationTime);
    if (scheduled < 0) return;

    const now = new Date();
    const slot = reminderSlot(settings.notificationTime, now);

    if (firedRef.current === slot) return;

    let lastNotified: string | null = null;
    try {
      lastNotified = window.localStorage.getItem(LAST_NOTIFIED_KEY);
    } catch {}
    if (lastNotified === slot) {
      firedRef.current = slot;
      return;
    }

    if (now.getHours() * 60 + now.getMinutes() < scheduled) return;

    firedRef.current = slot;
    try {
      window.localStorage.setItem(LAST_NOTIFIED_KEY, slot);
    } catch {}

    const message = t("due_cards_reminder", { count: dueFlashcards.length });
    const open = () => router.push("/home/flashcards");

    showFlashcardNotification({ title: t("flashcards"), body: message, onClick: open });

    toast.info(message, {
      action: { label: t("review_now"), onClick: open },
    });
  }, [
    dueFlashcards.length,
    hydrated,
    router,
    settings.enableNotifications,
    settings.notificationTime,
    t,
    tick,
  ]);

  return null;
}
