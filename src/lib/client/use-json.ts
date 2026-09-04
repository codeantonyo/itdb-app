"use client";

import { useCallback, useEffect, useState } from "react";

interface JsonState<T> {
  forUrl: string | null;
  data: T | null;
  error: string | null;
  status: number | null;
}

export interface UseJsonResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** HTTP status of the last failed request (503 = network busy) */
  status: number | null;
  refresh: () => void;
}

/**
 * Minimal polling JSON fetcher. A failed refresh keeps the last good
 * data (and reports the error) rather than blanking the screen — a
 * rate-limited Horizon must never read as "you have nothing" (§6.4).
 */
export function useJson<T>(url: string | null, intervalMs = 60_000): UseJsonResult<T> {
  const [state, setState] = useState<JsonState<T>>({
    forUrl: null,
    data: null,
    error: null,
    status: null,
  });

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* no body */
        }
        setState((prev) => ({
          forUrl: url,
          data: prev.forUrl === url ? prev.data : null,
          error: message,
          status: res.status,
        }));
        return;
      }
      const json = (await res.json()) as T;
      setState({ forUrl: url, data: json, error: null, status: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error";
      setState((prev) => ({
        forUrl: url,
        data: prev.forUrl === url ? prev.data : null,
        error: message,
        status: 0,
      }));
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    queueMicrotask(load);
    // Poll only while the tab is visible; catch up when the member returns.
    const tick = () => {
      if (!document.hidden) load();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [url, intervalMs, load]);

  const current = state.forUrl === url ? state : null;

  return {
    data: url ? (current?.data ?? null) : null,
    loading: url !== null && current === null,
    error: current?.error ?? null,
    status: current?.status ?? null,
    refresh: load,
  };
}
