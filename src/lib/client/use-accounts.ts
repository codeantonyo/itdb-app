"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountResponse } from "@/lib/stellar/types";

interface State {
  forKey: string | null;
  data: AccountResponse[] | null;
  error: string | null;
}

/**
 * Fetches several Stellar accounts in parallel and polls them together —
 * the data source behind multi-wallet portfolios. 120s cadence: on-chain
 * balances rarely change minute-to-minute and every mutation path
 * refreshes explicitly.
 */
export function useAccounts(addresses: string[], intervalMs = 120_000) {
  const key = addresses.join(",");
  const [state, setState] = useState<State>({ forKey: null, data: null, error: null });

  const load = useCallback(async () => {
    if (!key) return;
    const targets = key.split(",");
    try {
      const results = await Promise.all(
        targets.map(async (address) => {
          const res = await fetch(`/api/account/${address}`);
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `Account fetch failed (${res.status})`);
          }
          return (await res.json()) as AccountResponse;
        }),
      );
      setState({ forKey: key, data: results, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error";
      // Keep the last good balances; never replace them with nothing.
      setState((prev) => ({
        forKey: key,
        data: prev.forKey === key ? prev.data : null,
        error: message,
      }));
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    queueMicrotask(load);
    const tick = () => {
      if (!document.hidden) load();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [key, intervalMs, load]);

  const current = state.forKey === key ? state : null;

  return {
    data: key ? (current?.data ?? null) : null,
    loading: key !== "" && current === null,
    error: current?.error ?? null,
    refresh: load,
  };
}
