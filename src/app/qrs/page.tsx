"use client";

import { useState } from "react";
import type { QrsSummary } from "@/app/api/qrs/route";
import { AppBar } from "@/components/layout/app-bar";
import { ExactFigure } from "@/components/shared/exact-figure";
import { LedgerLine } from "@/components/shared/ledger-line";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { SimulatedNotice, SourceBadge } from "@/components/shared/simulated-notice";
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
import { formatAmount, formatCurrency, formatExactCurrency, formatKg } from "@/lib/format";
import { QRS_METAL_LABEL, QRS_TOKEN, marketUrl } from "@/lib/itdb/config";

const rangeLabel = (min: number, max: number | null) =>
  max === null ? `${formatAmount(min, 0)}+ QRS` : `${formatAmount(min, 0)} – ${formatAmount(max, 0)} QRS`;

export default function QrsPage() {
  const { session } = useAuth();
  const portfolio = usePortfolio();
  const asset = portfolio.assets.find((a) => a.code === "QRS");
  const summary = useJson<QrsSummary>("/api/qrs", 60_000);
  const ledger = useWalletLedger(!!session);
  const { cards } = useCards(session?.address ?? null);
  const [collectOpen, setCollectOpen] = useState(false);
  const s = summary.data;

  const collect = async (destination: string): Promise<CollectOutcome> => {
    try {
      const r = await fetch("/api/qrs/actions", {
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

  return (
    <div className="flex flex-col gap-6">
      <AppBar back title="QRS" subtitle="Gold-referenced reserve token" />

      <TokenHeader code="QRS" role="Gold-referenced" asset={asset} marketUrl={marketUrl(QRS_TOKEN)} loading={portfolio.loading} tierLabel={s?.tier ? `Tier ${s.tier.tier}` : null} />

      {summary.error && !s && <NetworkNotice message={summary.error} onRetry={summary.refresh} />}

      {s ? (
        <YieldCard y={s.yield} minLabel={`${formatAmount(s.tiers[0].min, 0)} QRS`} onCollect={() => setCollectOpen(true)} />
      ) : summary.loading ? (
        <Skeleton className="h-[300px] rounded-[20px]" />
      ) : null}

      {s ? (
        <TierProgress
          balance={s.balance}
          unit="QRS"
          currentTier={s.tier?.tier ?? null}
          rows={s.tiers.map((t) => ({ tier: t.tier, min: t.min, max: t.max, range: rangeLabel(t.min, t.max), value: `${formatCurrency(t.dailyUsd)} / day`, detail: `${Object.keys(t.daily).length} crypto · gold ${formatKg(t.goldKg)}` }))}
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Gold & metals reference" note="simulated" />
        {s ? (
          <div className="surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-muted">Gold reference</p>
                <p className="font-display mt-1 text-[30px] font-semibold leading-none text-gold">{formatKg(s.gold.kg)}</p>
                <ExactFigure compact={`≈ ${formatCurrency(s.gold.valueUsd)}`} exact={`≈ ${formatExactCurrency(s.gold.valueUsd)}`} className="mt-1.5 block text-[14px] text-muted" />
              </div>
              <SourceBadge source={s.gold.source} />
            </div>
            <div className="mt-3">
              <LedgerLine label="Basis" value={s.gold.basis === "per-token" ? `${s.backing.gramsPerToken} g per QRS` : `Tier ${s.tier?.tier ?? "—"} table`} valueClassName="font-medium" sub={`${formatKg(s.backing.totalKg)} over ${formatAmount(s.backing.totalSupply, 0)} tokens`} />
              <LedgerLine label="Gold price" value={`${formatCurrency(s.gold.usdPerKg)} / kg`} valueClassName="font-medium" />
              {s.tier && <LedgerLine label="Tier table allocation" value={formatKg(s.gold.tierTableKg)} valueClassName="font-medium" />}
              {s.metals.map((m) => (
                <LedgerLine key={m.metal} label={QRS_METAL_LABEL[m.metal]} value={<ExactFigure compact={formatCurrency(m.valueUsd)} exact={formatExactCurrency(m.valueUsd)} />} sub={`${formatKg(m.kg)} · ${formatCurrency(m.usdPerKg)} / kg`} mark={<SourceBadge source={m.source} />} />
              ))}
            </div>
            <SimulatedNotice className="mt-4">
              <span className="font-semibold text-primary">Simulated reference position — no bullion is held for you.</span> Gold and metal figures are
              reference entitlements priced at live or reference rates. Nothing is allocated, vaulted or deliverable, and no bank relationship is
              implied. Rhodium, iridium, osmium and tungsten use reference prices, not live quotes.
            </SimulatedNotice>
          </div>
        ) : summary.loading ? (
          <Skeleton className="h-[260px] rounded-[20px]" />
        ) : null}
      </section>

      {s && (
        <CollectPanel
          open={collectOpen}
          onClose={() => setCollectOpen(false)}
          program="qrs"
          pendingUsd={s.yield.pendingUsd}
          cards={cards}
          ledgerCards={ledger.cards}
          onConfirm={collect}
        />
      )}
    </div>
  );
}
