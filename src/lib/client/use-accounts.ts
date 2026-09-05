"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { AccountResponse } from "@/lib/stellar/types";
import { load, peek, subscribe } from "./fetch-cache";

const urlFor = (address: string) => `/api/account/${address}`;

/**
 * Live balances for every linked wallet, read through the shared cache.
 *
 * Each address is its own cache entry, so two pages showing the same
 * wallet cost one request between them. 120s cadence: on-chain balances
 * rarely move minute to minute and every mutation refreshes explicitly.
 */
export function useAccounts(addresses: string[], intervalMs = 120_000) {
  const key = addresses.join(",");

  const snapshot = useSyncExternalStore(
    useCallback(
      (fn) => {
        const offs = key ? key.split(",").map((a) => subscribe(urlFor(a), fn)) : [];
        return () => offs.forEach((off) => off());
      },
      [key],
    ),
    useCallback(() => {
      if (!key) return "";
      // A cheap string fingerprint keeps the snapshot referentially
      // stable; the real objects are read in the memo below.
      return key
        .split(",")
        .map((a) => {
          const e = peek<AccountResponse>(urlFor(a));
          return `${e.at}:${e.error ?? ""}`;
        })
        .join("|");
    }, [key]),
    useCallback(() => "", []),
  );

  useEffect(() => {
    if (!key) return;
    const addrs = key.split(",");
    const run = () => addrs.forEach((a) => void load(urlFor(a), intervalMs));
    run();
    const tick = () => {
      if (!document.hidden) run();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [key, intervalMs]);

  const refresh = useCallback(() => {
    if (!key) return;
    key.split(",").forEach((a) => void load(urlFor(a), intervalMs, true));
  }, [key, intervalMs]);

  return useMemo(() => {
    if (!key) return { data: null, loading: false, error: null, refresh };
    const entries = key.split(",").map((a) => peek<AccountResponse>(urlFor(a)));
    const data = entries.map((e) => e.data).filter((d): d is AccountResponse => d !== null);
    const error = entries.find((e) => e.error)?.error ?? null;
    return {
      // Partial results beat none: show the wallets that answered.
      data: data.length > 0 ? data : null,
      loading: data.length === 0 && !error,
      error,
      refresh,
    };
    // `snapshot` is the change signal from the store above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, snapshot, refresh]);
}
