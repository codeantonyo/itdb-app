"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const THEME_KEY = "itdb:theme";

/**
 * Inline script for <head> — applies the theme before first paint.
 * Dark (deep navy) is the house default; light is parchment.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")||"dark";if(t==="dark")document.documentElement.classList.add("dark");}catch(e){document.documentElement.classList.add("dark");}})();`;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

const getServerSnapshot = (): Theme => "dark";

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* private mode */
    }
    document.documentElement.classList.toggle("dark", t === "dark");
    emit();
  }, []);

  return { theme, setTheme };
}
