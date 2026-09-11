"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserPreferences, UserProfile } from "@/types/models";
import { queryKeys } from "@/lib/query/query-provider";
import {
  ensureUserProfile,
  loadUserProfile,
  profileNeedsCompletion,
  saveUserPreferences,
  updateUserProfile,
} from "@/lib/data/user-profile";
import { currentPreferences, useUiStore } from "@/lib/store/ui-store";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "./use-auth";

const PREFERENCE_WRITE_DELAY = 900;

export function useUserProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<UserProfile | null>({
    queryKey: queryKeys.userProfile(user?.uid ?? "anonymous"),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!user) return null;
      const existing = await loadUserProfile(user.uid);
      if (existing) return existing;
      if (profileNeedsCompletion(user, null)) return null;
      return ensureUserProfile({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        providers: user.providers,
      });
    },
  });

  const rename = useMutation({
    mutationFn: async (displayName: string) => {
      if (!user) throw new Error("Sessão expirada.");
      await updateUserProfile(user.uid, { displayName });
      return displayName;
    },
    onSuccess: (displayName) => {
      queryClient.setQueryData<UserProfile | null>(
        queryKeys.userProfile(user?.uid ?? "anonymous"),
        (previous) => (previous ? { ...previous, displayName } : previous)
      );
    },
  });

  const complete = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.userProfile(user?.uid ?? "anonymous") });
  };

  return { profile: query.data ?? null, loading: query.isLoading, rename, complete };
}

export function useUserPreferencesSync(): void {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const hydratePreferences = useUiStore((state) => state.hydratePreferences);

  const hydratedFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      hydratedFor.current = null;
      lastWritten.current = null;
      return;
    }
    if (!profile || hydratedFor.current === user.uid) return;
    hydratedFor.current = user.uid;

    const { theme: storedTheme, ...layout } = profile.preferences ?? {};
    if (Object.keys(layout).length > 0) {
      hydratePreferences(layout);
    }
    if (storedTheme && storedTheme !== theme) {
      setTheme(storedTheme);
    }

    const currentActive: UserPreferences = {
      ...currentPreferences(),
      ...layout,
      ...(storedTheme ? { theme: storedTheme } : { theme }),
    };
    lastWritten.current = JSON.stringify(currentActive);
  }, [hydratePreferences, profile, setTheme, theme, user]);

  useEffect(() => {
    if (!user || hydratedFor.current !== user.uid) return;

    const schedule = (immediate = false) => {
      const preferences: UserPreferences = { ...currentPreferences(), theme };
      const serialized = JSON.stringify(preferences);
      if (serialized === lastWritten.current) return;

      if (timer.current) clearTimeout(timer.current);

      const commit = () => {
        lastWritten.current = serialized;
        void saveUserPreferences(user.uid, preferences)
          .then(() => {
            queryClient.setQueryData<UserProfile | null>(
              queryKeys.userProfile(user.uid),
              (previous) =>
                previous
                  ? { ...previous, preferences: { ...previous.preferences, ...preferences } }
                  : previous
            );
          })
          .catch(() => {});
      };

      if (immediate) {
        commit();
      } else {
        timer.current = setTimeout(commit, PREFERENCE_WRITE_DELAY);
      }
    };

    let prevLanguage = useUiStore.getState().language;
    let prevSidebar = useUiStore.getState().sidebarCollapsed;

    const unsubscribe = useUiStore.subscribe((state) => {
      const langChanged = state.language !== prevLanguage;
      const sidebarChanged = state.sidebarCollapsed !== prevSidebar;
      prevLanguage = state.language;
      prevSidebar = state.sidebarCollapsed;

      if (langChanged || sidebarChanged) {
        schedule(true);
      } else {
        schedule(false);
      }
    });

    schedule(false);

    return () => {
      unsubscribe();
      if (timer.current) {
        clearTimeout(timer.current);
        const preferences: UserPreferences = { ...currentPreferences(), theme };
        void saveUserPreferences(user.uid, preferences)
          .then(() => {
            queryClient.setQueryData<UserProfile | null>(
              queryKeys.userProfile(user.uid),
              (previous) =>
                previous
                  ? { ...previous, preferences: { ...previous.preferences, ...preferences } }
                  : previous
            );
          })
          .catch(() => {});
      }
    };
  }, [profile, queryClient, theme, user]);
}
