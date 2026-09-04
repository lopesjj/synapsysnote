"use client";

import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";

type Theme = "dark" | "light";

const KEY = "synapsys.theme";
const EVENT = "synapsys:themechange";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener(EVENT, callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener(EVENT, callback);
  };
}

/**
 * The DOM class is the single source of truth — it is set by `themeScript`
 * before the first paint, so reading it avoids both a flash and a hydration
 * mismatch. React just subscribes to changes.
 */
function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the theme simply resets on the next visit.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return useMemo(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [setTheme, theme]
  );
}

/**
 * Applies the persisted theme before paint so the first frame never flashes the
 * wrong canvas color.
 */
export const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('${KEY}');
    var dark = stored ? stored === 'dark' : !window.matchMedia('(prefers-color-scheme: light)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;
