"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import { useUiStore } from "@/lib/store/ui-store";

export function FlashcardNotificationsWatcher() {
  const { dueFlashcards } = useWorkspace();
  const { t } = useTranslation();
  const router = useRouter();
  const notifiedDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const today = new Date().toISOString().slice(0, 10);
    const lastNotified = window.localStorage.getItem("synapsys.flashcards.lastNotificationDate");
    if (lastNotified === today || notifiedDateRef.current === today) return;

    if (dueFlashcards.length > 0) {
      notifiedDateRef.current = today;
      window.localStorage.setItem("synapsys.flashcards.lastNotificationDate", today);

      if ("Notification" in window && Notification.permission === "granted") {
        try {
          const notif = new Notification(t("flashcards"), {
            body: `${t("due_today")}: ${dueFlashcards.length} ${t("cards_count_badge")}.`,
            icon: "/icon.png",
          });
          notif.onclick = () => {
            window.focus();
            router.push("/home/flashcards");
          };
        } catch {}
      }

      toast.info(`${t("due_today")}: ${dueFlashcards.length} ${t("cards_count_badge")}`, {
        action: {
          label: t("review_now"),
          onClick: () => router.push("/home/flashcards"),
        },
      });
    }
  }, [dueFlashcards.length, router, t]);

  return null;
}
