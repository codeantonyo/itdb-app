"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { load, peek, subscribe, type CacheEntry } from "./fetch-cache";

export interface UseJsonResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** HTTP status of the last failure (503 = network busy) */
  status: number | null;
  refresh: () => void;
}

const SERVER: CacheEntry = { data: null, error: null, status: null, at: 0, loading: true };

/**
 * Read a JSON endpoint through the shared cache.
 *
 * Every component asking for the same URL shares one request and one
 * result, so mounting three cards that all need the portfolio costs one
 * fetch. Polling only runs while the tab is visible, and a failed poll
 * keeps the last good data rather than blanking the screen.
 */
export function useJson<T>(url: string | null, intervalMs = 60_000): UseJsonResult<T> {
  const entry = useSyncExternalStore(
    useCallback((fn) => (url ? subscribe(url, fn) : () => {}), [url]),
    useCallback(() => (url ? peek<T>(url) : (SERVER as CacheEntry<T>)), [url]),
    useCallback(() => SERVER as CacheEntry<T>, []),
  );

  useEffect(() => {
    if (!url) return;
    void load(url, intervalMs);
    const tick = () => {
      if (!document.hidden) void load(url, intervalMs);
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [url, intervalMs]);

  const refresh = useCallback(() => {
    if (url) void load(url, intervalMs, true);
  }, [url, intervalMs]);

  return {
    data: url ? entry.data : null,
    // Only "loading" before the first successful read.
    loading: url !== null && entry.data === null && entry.error === null,
    error: entry.error,
    status: entry.status,
    refresh,
  };
}
