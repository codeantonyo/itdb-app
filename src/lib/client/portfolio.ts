"use client";

import { useMemo } from "react";
import { TOKEN_REGISTRY } from "@/lib/stellar/registry";
import type { AccountPayment, PricePoint, TokensResponse } from "@/lib/stellar/types";
import { useAuth } from "./auth";
import { useCards } from "./cards";
import { useAccounts } from "./use-accounts";
import { useJson } from "./use-json";

/** Members only ever see XLM plus the three ITDB tokens. */
const VISIBLE_CODES = new Set(["XLM", ...TOKEN_REGISTRY.map((t) => t.code)]);

/** Friendly names for in-app (ledger) activity sources. */
export const LEDGER_SOURCE_LABELS: Record<string, string> = {
  itdbone: "ITDBONE yield",
  qrs: "QRS yield",
  airdrop: "Airdrop withdrawal",
};

interface LedgerTxnLite {
  id: string;
  at: number;
  from: string;
  to: string;
  amount: number;
  currency: string;
}

/** UI view-model for one asset (XLM or registry token). */
export interface PortfolioAsset {
  id: string;
  code: string;
  issuer: string | null;
  name: string;
  image: string | null;
  desc: string | null;
  domain: string | null;
  balance: number;
  perWallet: { wallet: string; balance: number }[];
  priceUsd: number | null;
  change24h: number | null;
  valueUsd: number;
  spark: number[];
  history: PricePoint[];
  hasMarket: boolean;
  /** false = a Horizon lookup behind this row was rate-limited */
  resolved: boolean;
  isNative: boolean;
}

export type PortfolioPayment = AccountPayment & { wallet: string };

export interface Portfolio {
  loading: boolean;
  error: string | null;
  /** True when balances could not be fetched at all — show a notice, not zeros */
  balancesUnknown: boolean;
  accountExists: boolean | null;
  assets: PortfolioAsset[];
  totalUsd: number;
  change24hPercent: number;
  change24hUsd: number;
  spark: number[];
  history: PricePoint[];
  payments: PortfolioPayment[];
  prices: Record<string, number | null>;
  walletCount: number;
  xlmUsd: number;
  refresh: () => void;
}

export function normalizeSeries(points: number[]): number[] {
  if (points.length < 2) return [];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  if (span === 0) return points.map(() => 0.5);
  return points.map((p) => (p - min) / span);
}

/** Dust check: micro-payments that should be hidden from the feed. */
export function isDustPayment(
  payment: AccountPayment,
  prices: Record<string, number | null>,
): boolean {
  const price = prices[payment.code];
  if (price != null && price > 0) return payment.amount * price < 0.01;
  return payment.amount < 0.001;
}

export function usePortfolio(): Portfolio {
  const { session } = useAuth();
  const tokens = useJson<TokensResponse>("/api/tokens", 300_000);
  const accounts = useAccounts(session?.wallets ?? []);
  const ledger = useJson<{ txns?: LedgerTxnLite[] }>(
    session ? "/api/wallet/ledger" : null,
    120_000,
  );
  const { cards } = useCards(session?.address ?? null);

  return useMemo<Portfolio>(() => {
    const t = tokens.data;
    const accs = accounts.data ?? [];

    const balanceFor = (code: string, issuer: string | null) => {
      let total = 0;
      const perWallet: { wallet: string; balance: number }[] = [];
      for (const acc of accs) {
        const balance =
          acc.balances.find((b) => b.code === code && b.issuer === issuer)?.balance ?? 0;
        if (balance > 0) perWallet.push({ wallet: acc.id, balance });
        total += balance;
      }
      return { total, perWallet };
    };

    const assets: PortfolioAsset[] = [];

    if (t) {
      const xlm = balanceFor("XLM", null);
      assets.push({
        id: "XLM",
        code: "XLM",
        issuer: null,
        name: "Stellar Lumens",
        image: "/tokens/xlm.svg",
        desc: "The native asset of the Stellar network.",
        domain: "stellar.org",
        balance: xlm.total,
        perWallet: xlm.perWallet,
        priceUsd: t.xlm.priceUsd,
        change24h: t.xlm.change24h,
        valueUsd: xlm.total * t.xlm.priceUsd,
        spark: normalizeSeries(t.xlm.history.map((p) => p.v)),
        history: t.xlm.history,
        hasMarket: true,
        resolved: true,
        isNative: true,
      });

      for (const token of t.tokens) {
        const held = balanceFor(token.code, token.issuer);
        assets.push({
          id: `${token.code}:${token.issuer}`,
          code: token.code,
          issuer: token.issuer,
          name: token.name,
          image: token.image,
          desc: token.desc,
          domain: token.domain,
          balance: held.total,
          perWallet: held.perWallet,
          priceUsd: token.priceUsd,
          change24h: token.change24h,
          valueUsd: held.total * (token.priceUsd ?? 0),
          spark: normalizeSeries(token.history.map((p) => p.v)),
          history: token.history,
          hasMarket: token.hasMarket,
          resolved: token.resolved,
          isNative: false,
        });
      }
    }

    const totalUsd = assets.reduce((sum, x) => sum + x.valueUsd, 0);

    let change24hPercent = 0;
    if (totalUsd > 0) {
      change24hPercent =
        assets.reduce((sum, x) => sum + x.valueUsd * (x.change24h ?? 0), 0) / totalUsd;
    }
    const change24hUsd = (totalUsd * change24hPercent) / (100 + change24hPercent || 1);

    const history: PricePoint[] = [];
    if (totalUsd > 0 && t) {
      const now = t.updatedAt;
      for (let d = 7; d >= 0; d--) {
        const ts = now - d * 86_400_000;
        let value = 0;
        for (const asset of assets) {
          if (asset.balance <= 0) continue;
          let price = asset.priceUsd ?? 0;
          if (asset.history.length > 0) {
            const nearest = asset.history.reduce((best, p) =>
              Math.abs(p.t - ts) < Math.abs(best.t - ts) ? p : best,
            );
            price = nearest.v;
          }
          value += asset.balance * price;
        }
        history.push({ t: ts, v: value });
      }
    }

    const cardName = (id: string) => {
      const card = cards.find((c) => c.id === id);
      return card ? `${card.name} ·· ${card.number.slice(-4)}` : "your card";
    };
    const ledgerPayments: PortfolioPayment[] = (ledger.data?.txns ?? []).map((txn) => {
      const sourceLabel = LEDGER_SOURCE_LABELS[txn.from];
      const isDeposit = txn.to === "account";
      return {
        id: `ledger:${txn.id}`,
        direction: sourceLabel || isDeposit ? "received" : "sent",
        kind: sourceLabel ? `ledger_${txn.from}` : "ledger_transfer",
        code: txn.currency,
        amount: txn.amount,
        counterparty: sourceLabel ?? (isDeposit ? cardName(txn.from) : cardName(txn.to)),
        at: new Date(txn.at).toISOString(),
        wallet: "ITDB",
      };
    });

    const payments: PortfolioPayment[] = [
      ...accs
        .flatMap((acc) => acc.payments.map((p) => ({ ...p, wallet: acc.id })))
        .filter((p) => VISIBLE_CODES.has(p.code)),
      ...ledgerPayments,
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 60);

    const prices: Record<string, number | null> = {};
    for (const asset of assets) prices[asset.code] = asset.priceUsd;

    const primary = accs.find((a) => a.id === session?.address);

    return {
      loading: tokens.loading || accounts.loading,
      error: tokens.error ?? accounts.error,
      balancesUnknown: !!accounts.error && accounts.data === null,
      accountExists: primary ? primary.exists : null,
      assets,
      totalUsd,
      change24hPercent,
      change24hUsd,
      spark: normalizeSeries(history.map((p) => p.v)),
      history,
      payments,
      prices,
      walletCount: session?.wallets.length ?? 0,
      xlmUsd: t?.xlm.priceUsd ?? 0,
      refresh: () => {
        tokens.refresh();
        accounts.refresh();
        ledger.refresh();
      },
    };
  }, [tokens, accounts, ledger, cards, session?.address, session?.wallets.length]);
}
