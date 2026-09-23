"use client";

import { useEffect, useRef, useState } from "react";
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
import { saveUserAvatar, removeUserAvatar } from "@/lib/data/user-avatar";
import { currentPreferences, useUiStore } from "@/lib/store/ui-store";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "./use-auth";

const PREFERENCE_WRITE_DELAY = 900;

export function useUserProfile() {
  const { user, updateAuthPhoto } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<UserProfile | null>({
    queryKey: queryKeys.userProfile(user?.uid ?? "anonymous"),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!user) return null;
      const existing = await loadUserProfile(user.uid);
      if (existing) {
        // O e-mail de login muda depois que a pessoa confirma a troca: o perfil acompanha.
        if (user.email && existing.email !== user.email) {
          void updateUserProfile(user.uid, { email: user.email }).catch(() => {});
          return { ...existing, email: user.email };
        }
        return existing;
      }
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

  useEffect(() => {
    if (query.data && query.data.photoURL === null && user?.photoURL) {
      void updateAuthPhoto(null);
    }
  }, [query.data, user?.photoURL, updateAuthPhoto]);

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

  const updateAvatar = useMutation({
    mutationFn: async (blob: Blob) => {
      if (!user) throw new Error("Sessão expirada.");
      const currentPhoto = query.data?.photoURL ?? user.photoURL;
      const url = await saveUserAvatar(user.uid, blob, currentPhoto);
      return url;
    },
    onSuccess: (url) => {
      queryClient.setQueryData<UserProfile | null>(
        queryKeys.userProfile(user?.uid ?? "anonymous"),
        (previous) => (previous ? { ...previous, photoURL: url } : previous)
      );
    },
  });

  const removeAvatar = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada.");
      const currentPhoto = query.data?.photoURL ?? user.photoURL;
      await removeUserAvatar(user.uid, currentPhoto);
    },
    onSuccess: () => {
      queryClient.setQueryData<UserProfile | null>(
        queryKeys.userProfile(user?.uid ?? "anonymous"),
        (previous) => (previous ? { ...previous, photoURL: null } : previous)
      );
    },
  });

  const complete = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.userProfile(user?.uid ?? "anonymous") });
  };

  return {
    profile: query.data ?? null,
    loading: query.isLoading,
    rename,
    updateAvatar,
    removeAvatar,
    complete,
  };
}

export function useUserPreferencesSync(): boolean {
  const { user, loggingOut } = useAuth();
  const { profile } = useUserProfile();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const hydratePreferences = useUiStore((state) => state.hydratePreferences);

  const hydratedFor = useRef<string | null>(null);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    if (!user || loggingOut) {
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
    setReadyFor(user.uid);
  }, [hydratePreferences, loggingOut, profile, setTheme, theme, user]);

  useEffect(() => {
    if (!user || loggingOut || hydratedFor.current !== user.uid) return;

    const schedule = (immediate = false) => {
      if (loggingOut) return;
      const preferences: UserPreferences = { ...currentPreferences(), theme };
      const serialized = JSON.stringify(preferences);
      if (serialized === lastWritten.current) return;

      if (timer.current) clearTimeout(timer.current);

      const commit = () => {
        if (loggingOut) return;
        lastWritten.current = serialized;
        queryClient.setQueryData<UserProfile | null>(
          queryKeys.userProfile(user.uid),
          (previous) =>
            previous
              ? { ...previous, preferences: { ...previous.preferences, ...preferences } }
              : previous
        );
        void saveUserPreferences(user.uid, preferences).catch(() => {});
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
      if (loggingOut) return;
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
        timer.current = null;
        if (!loggingOut && user) {
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
      }
    };
  }, [loggingOut, profile, queryClient, theme, user]);

  return Boolean(user && !loggingOut && readyFor === user.uid);
}
