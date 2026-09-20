"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@/types/models";
import { queryKeys } from "@/lib/query/query-provider";
import { saveUserPreferences } from "@/lib/data/user-profile";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  DEFAULT_FLASHCARD_SETTINGS,
  readStoredSettings,
  sanitizeModifier,
  writeStoredSettings,
} from "@/lib/flashcards/srs";
import { useFlashcardSettings } from "@/lib/flashcards/use-flashcard-settings";

const WRITE_DELAY = 900;

export function FlashcardSettingsSync() {
  const { user, loggingOut } = useAuth();
  const { profile } = useUserProfile();
  const { settings, hydrated } = useFlashcardSettings();
  const queryClient = useQueryClient();

  const hydratedFor = useRef<string | null>(null);
  const lastWritten = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || loggingOut) {
      hydratedFor.current = null;
      lastWritten.current = null;
      return;
    }
    if (!profile || hydratedFor.current === user.uid) return;
    hydratedFor.current = user.uid;

    const remote = profile.preferences?.flashcardSettings;
    if (!remote) {
      lastWritten.current = JSON.stringify(readStoredSettings());
      return;
    }

    const normalized = {
      dailyGoal: Math.max(
        5,
        Math.min(200, Number(remote.dailyGoal) || DEFAULT_FLASHCARD_SETTINGS.dailyGoal)
      ),
      intervalModifier: sanitizeModifier(remote.intervalModifier),
      enableNotifications: Boolean(remote.enableNotifications),
      notificationTime:
        typeof remote.notificationTime === "string" &&
        /^\d{2}:\d{2}$/.test(remote.notificationTime)
          ? remote.notificationTime
          : DEFAULT_FLASHCARD_SETTINGS.notificationTime,
    };

    const serialized = JSON.stringify(normalized);
    lastWritten.current = serialized;
    if (serialized !== JSON.stringify(readStoredSettings())) {
      writeStoredSettings(normalized);
    }
  }, [loggingOut, profile, user]);

  useEffect(() => {
    if (!user || loggingOut || !hydrated) return;
    if (hydratedFor.current !== user.uid) return;

    const serialized = JSON.stringify(settings);
    if (serialized === lastWritten.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastWritten.current = serialized;
      void saveUserPreferences(user.uid, { flashcardSettings: settings })
        .then(() => {
          queryClient.setQueryData<UserProfile | null>(
            queryKeys.userProfile(user.uid),
            (previous) =>
              previous
                ? {
                    ...previous,
                    preferences: { ...previous.preferences, flashcardSettings: settings },
                  }
                : previous
          );
        })
        .catch(() => {});
    }, WRITE_DELAY);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [hydrated, loggingOut, queryClient, settings, user]);

  return null;
}
