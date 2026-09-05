"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import type { ItdboneSummary } from "@/app/api/itdbone/route";
import { AppBar } from "@/components/layout/app-bar";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { TierProgress } from "@/components/shared/tier-progress";
import { CollectPanel, type CollectOutcome } from "@/components/tokens/collect-panel";
import { TokenHeader } from "@/components/tokens/token-header";
import { YieldCard } from "@/components/tokens/yield-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/client/auth";
import { useCards } from "@/lib/client/cards";
import { usePortfolio } from "@/lib/client/portfolio";
import { useJson } from "@/lib/client/use-json";
import { useWalletLedger } from "@/lib/client/wallet-ledger";
import { formatAmount, formatCurrency } from "@/lib/format";
import { ITDBONE_TOKEN, METALS_PERK_LABEL, marketUrl } from "@/lib/itdb/config";
import { cn } from "@/lib/utils";

const rangeLabel = (min: number, max: number | null) =>
  max === null ? `${formatAmount(min, 0)}+ ITDBONE` : `${formatAmount(min, 0)} – ${formatAmount(max, 0)} ITDBONE`;

export default function ItdbonePage() {
  const { session } = useAuth();
  const portfolio = usePortfolio();
  const asset = portfolio.assets.find((a) => a.code === "ITDBONE");
  const summary = useJson<ItdboneSummary>("/api/itdbone", 60_000);
  const ledger = useWalletLedger(!!session);
  const { cards } = useCards(session?.address ?? null);
  const [collectOpen, setCollectOpen] = useState(false);
  const s = summary.data;

  const collect = async (destination: string): Promise<CollectOutcome> => {
    try {
      const r = await fetch("/api/itdbone/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collect", to: destination }),
      });
      const data = (await r.json()) as { error?: string; usd?: number; credited?: number; currency?: string };
      if (r.ok) {
        summary.refresh();
        ledger.refresh();
        portfolio.refresh();
        return { ok: true, usd: data.usd, credited: data.credited, currency: data.currency };
      }
      return { ok: false, error: data.error };
    } catch {
      return { ok: false, error: "Network error — try again." };
    }
  };

  const perks = s?.tier
    ? [
        { label: "Gold access", on: s.tier.goldAccess },
        { label: "Priority withdrawals", on: s.tier.priorityWithdrawals },
        { label: s.tier.metals ? METALS_PERK_LABEL[s.tier.metals] : "Metals programme", on: !!s.tier.metals },
        { label: "VIP support", on: s.tier.vipSupport },
        { label: "Private banking", on: s.tier.privateBanking },
        { label: "Founder status", on: s.tier.founderStatus },
        { label: "Lifetime rewards", on: s.tier.lifetimeRewards },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <AppBar back title="ITDBONE" subtitle="Bank stablecoin" />

      <TokenHeader code="ITDBONE" role="The bank's stablecoin" asset={asset} marketUrl={marketUrl(ITDBONE_TOKEN)} loading={portfolio.loading} tierLabel={s?.tier ? `Tier ${s.tier.tier}` : null} />

      {summary.error && !s && <NetworkNotice message={summary.error} onRetry={summary.refresh} />}

      {s ? (
        <YieldCard y={s.yield} minLabel={`${formatAmount(s.tiers[0].rangeMin, 0)} ITDBONE`} onCollect={() => setCollectOpen(true)} />
      ) : summary.loading ? (
        <Skeleton className="h-[300px] rounded-[20px]" />
      ) : null}

      {s ? (
        <TierProgress
          balance={s.yield.balance}
          unit="ITDBONE"
          currentTier={s.tier?.tier ?? null}
          rows={s.tiers.map((t) => ({ tier: t.tier, min: t.rangeMin, max: t.rangeMax, range: rangeLabel(t.rangeMin, t.rangeMax), value: `${formatCurrency(t.dailyUsd)} / day`, detail: `${formatAmount(t.apyPct, 0)}% APY · ${t.cashbackPct}% back` }))}
        />
      ) : null}

      {s?.tier && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Your perks" />
          <div className="surface p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-elevated px-3.5 py-3">
                <p className="text-[12px] text-muted">APY</p>
                <p className="tnum mt-0.5 text-[22px] font-semibold text-gold">{formatAmount(s.tier.apyPct, 0)}%</p>
              </div>
              <div className="rounded-xl bg-elevated px-3.5 py-3">
                <p className="text-[12px] text-muted">Cashback</p>
                <p className="tnum mt-0.5 text-[22px] font-semibold text-gold">{s.tier.cashbackPct}%</p>
              </div>
            </div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {perks.map((p) => (
                <li key={p.label} className={cn("flex items-center gap-2.5 text-[15px]", p.on ? "text-primary" : "text-muted-2")}>
                  <span className={cn("flex size-6 items-center justify-center rounded-full", p.on ? "bg-gold text-gold-ink" : "bg-elevated")}>
                    {p.on ? <Check className="size-3.5" strokeWidth={3} /> : <Minus className="size-3" />}
                  </span>
                  {p.label}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {s && (
        <CollectPanel
          open={collectOpen}
          onClose={() => setCollectOpen(false)}
          program="itdbone"
          pendingUsd={s.yield.pendingUsd}
          cards={cards}
          ledgerCards={ledger.cards}
          onConfirm={collect}
        />
      )}
    </div>
  );
}
