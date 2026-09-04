"use client";

import { useCallback, useMemo } from "react";
import { DEFAULT_CURRENCY } from "@/lib/wallet/currencies";
import { useJson } from "./use-json";

/**
 * Client view of the custodial ledger (card balance + transfers).
 * Server-authoritative; this hook reads it and issues mutations, then
 * refetches. The main "Available balance" is derived elsewhere by
 * subtracting `fromAccountUsd` from the live portfolio.
 */

export interface LedgerCard {
  currency: string;
  balance: number;
}

export interface LedgerTxn {
  id: string;
  at: number;
  from: string;
  to: string;
  amount: number;
  currency: string;
  xlmValue: number;
}

interface LedgerResponse {
  cards: Record<string, LedgerCard>;
  txns: LedgerTxn[];
  usdRates: Record<string, number>;
  xlmUsd: number;
  /** Net XLM moved account→card (yield credits excluded) */
  fromAccountXlm: number;
}

export interface TransferArgs {
  from: string; // "account" | cardId
  to: string; // "account" | cardId
  amount: number;
  currency: string;
  /** Live portfolio value in XLM — bounds account→card transfers. */
  portfolioXlm: number;
}

export interface TransferResult {
  ok: boolean;
  error?: string;
  /** Exact amount credited to the destination, in its currency */
  credited?: number;
  currency?: string;
}

export function useWalletLedger(enabled: boolean) {
  const res = useJson<LedgerResponse>(enabled ? "/api/wallet/ledger" : null, 120_000);

  const cards = useMemo(() => res.data?.cards ?? {}, [res.data]);
  const usdRates = useMemo(() => res.data?.usdRates ?? {}, [res.data]);
  const txns = useMemo(() => res.data?.txns ?? [], [res.data]);
  const xlmUsd = res.data?.xlmUsd ?? 0;

  /** Convert between supported currencies using live USD rates. */
  const convert = useCallback(
    (amount: number, from: string, to: string): number => {
      if (from === to) return amount;
      const fromUsd = usdRates[from];
      const toUsd = usdRates[to];
      if (!fromUsd || !toUsd) return amount;
      return (amount * fromUsd) / toUsd;
    },
    [usdRates],
  );

  /** Total value currently held on the card. */
  const allocatedUsd = useMemo(() => {
    let usd = 0;
    for (const c of Object.values(cards)) usd += c.balance * (usdRates[c.currency] ?? 0);
    return usd;
  }, [cards, usdRates]);

  /**
   * USD moved out of the main account into the card, NET of deposits
   * back. This — not the card value — is what the "Available balance"
   * subtracts. It can go NEGATIVE: yield collected into the account
   * makes the balance rise above the live portfolio, like cash paid in.
   */
  const fromAccountUsd = (res.data?.fromAccountXlm ?? 0) * xlmUsd;

  const registerCard = useCallback(
    async (cardId: string, currency: string = DEFAULT_CURRENCY): Promise<{ ok: boolean; error?: string }> => {
      try {
        const r = await fetch("/api/wallet/ledger", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId, currency }),
        });
        const data = (await r.json()) as { error?: string };
        res.refresh();
        return r.ok ? { ok: true } : { ok: false, error: data.error };
      } catch {
        return { ok: false, error: "Offline — reconciled on next load." };
      }
    },
    [res],
  );

  const removeCard = useCallback(
    async (cardId: string): Promise<{ amount: number; currency: string } | null> => {
      try {
        const r = await fetch("/api/wallet/ledger", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId }),
        });
        const data = (await r.json()) as { returned?: { amount: number; currency: string } | null };
        res.refresh();
        return data.returned ?? null;
      } catch {
        return null;
      }
    },
    [res],
  );

  const transfer = useCallback(
    async (args: TransferArgs): Promise<TransferResult> => {
      try {
        const r = await fetch("/api/wallet/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = (await r.json()) as {
          ok?: boolean;
          error?: string;
          credited?: number;
          currency?: string;
        };
        res.refresh();
        return r.ok
          ? { ok: true, credited: data.credited, currency: data.currency }
          : { ok: false, error: data.error };
      } catch {
        return { ok: false, error: "Network error — try again." };
      }
    },
    [res],
  );

  return {
    cards,
    txns,
    usdRates,
    xlmUsd,
    allocatedUsd,
    fromAccountUsd,
    loading: res.loading,
    error: res.error,
    convert,
    registerCard,
    setCardCurrency: registerCard,
    removeCard,
    transfer,
    refresh: res.refresh,
  };
}
