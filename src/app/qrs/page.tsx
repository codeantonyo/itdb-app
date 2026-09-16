"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
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
import { MilestoneList, MultiplierBanner } from "@/components/tokens/milestones";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/client/auth";
import { useCards } from "@/lib/client/cards";
import { usePortfolio } from "@/lib/client/portfolio";
import { useJson } from "@/lib/client/use-json";
import { useWalletLedger } from "@/lib/client/wallet-ledger";
import { formatAmount, formatCurrency, formatExactCurrency, formatKg } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QRS_METAL_LABEL, QRS_TOKEN, marketUrl, qrsTierGoldKg } from "@/lib/itdb/config";

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
  const [refundOpen, setRefundOpen] = useState(false);
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

  const claimRefund = async (destination: string): Promise<CollectOutcome> => {
    try {
      const r = await fetch("/api/qrs/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "presale-refund", to: destination }),
      });
      const data = (await r.json()) as { error?: string; usd?: number; credited?: number; currency?: string };
      if (r.ok) {
        summary.refresh();
        ledger.refresh();
        return { ok: true, usd: data.usd, credited: data.credited, currency: data.currency };
      }
      return { ok: false, error: data.error };
    } catch {
      return { ok: false, error: "Network error — try again." };
    }
  };

  const presale = s?.presale ?? null;
  const bonus = s?.bonus ?? null;

  return (
    <div className="flex flex-col gap-6">
      <AppBar back title="QRS" subtitle="Gold-referenced reserve token" />

      <TokenHeader
        code="QRS"
        role="Gold-referenced"
        asset={asset}
        marketUrl={marketUrl(QRS_TOKEN)}
        loading={portfolio.loading}
        tierLabel={s?.tier ? `Tier ${s.tier.tier}` : null}
        priceOverride={s ? { usd: s.backingUsd, label: "Gold backing value", marketLabel: "Market price" } : null}
      />

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
          rows={s.tiers.map((t) => ({ tier: t.tier, min: t.min, max: t.max, range: rangeLabel(t.min, t.max), value: `${formatCurrency(t.dailyUsd)} / day`, detail: `${Object.keys(t.daily).length} crypto · gold ${formatKg(qrsTierGoldKg(t))}` }))}
        />
      ) : null}

      {bonus && bonus.state !== "none" && bonus.state !== "pending" && (
        <section className="flex flex-col gap-3">
          <SectionHeader title={`${bonus.pct}% Milestone Bonus`} note="unlocked" />
          <div className="surface p-5">
            {bonus.state === "delivered" ? (
              <>
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                    <Check className="size-[22px]" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15.5px] font-semibold text-primary">QRS {bonus.pct}% Milestone Bonus</p>
                      <span className="rounded-md bg-success-soft px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-success">
                        Delivered
                      </span>
                    </div>
                    <p className="tnum font-display mt-1.5 text-[26px] font-semibold leading-none text-gold">
                      {formatAmount(bonus.bonusQrs, 2)} QRS
                    </p>
                    <p className="mt-1.5 text-[13px] text-muted">
                      {bonus.pct}% of your {formatAmount(bonus.basisBalance, 2)} QRS
                      {bonus.category === "existing" ? " as an existing holder" : " on reaching Tier 1"}
                    </p>
                    {bonus.awardedAt && (
                      <p className="tnum mt-1 text-[12.5px] text-muted-2">
                        Recorded{" "}
                        {new Date(bonus.awardedAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    )}
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-4 rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                    bonus.paidOnChainAt ? "bg-success-soft text-success" : "bg-elevated text-muted",
                  )}
                >
                  {bonus.paidOnChainAt ? (
                    <>Paid to your wallet on chain.</>
                  ) : (
                    <>
                      <span className="font-semibold text-primary">Awaiting the on-chain payout.</span> Your entitlement
                      is recorded and cannot change; it is not in your wallet balance until the issuer sends it.
                    </>
                  )}
                </p>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-elevated text-muted-2">
                  <Lock className="size-[19px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15.5px] font-semibold text-primary">QRS {bonus.pct}% Bonus</p>
                    <span className="rounded-md bg-elevated px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-muted-2">
                      Locked
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                    Reach Tier 1 ({formatAmount(bonus.tier1Min, 0)} QRS) to unlock.{" "}
                    <span className="tnum font-semibold text-primary">
                      {formatAmount(bonus.needed, 2)} QRS
                    </span>{" "}
                    to go — worth about {formatAmount(bonus.tier1Min * (bonus.pct / 100), 0)} QRS at the threshold.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {presale && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Early bird bonuses" note="pre-sale" />
          <div className="surface p-5">
            <p className="text-[13.5px] leading-relaxed text-muted">
              Your wallet is on the pre-sale list, so both early-bird bonuses are yours.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-elevated px-3.5 py-3">
                <p className="text-[12px] text-muted">{presale.refundPct}% Refund (XLM)</p>
                <p className="tnum font-display mt-1 text-[20px] font-semibold leading-none text-gold">
                  {formatAmount(presale.refundXlm, 4)}
                </p>
                <p className="tnum mt-1 text-[12px] text-muted-2">≈ {formatCurrency(presale.refundUsd)}</p>
              </div>
              <div className="rounded-2xl bg-elevated px-3.5 py-3">
                <p className="text-[12px] text-muted">×2 Tokens Drop (QRS)</p>
                <p className="tnum font-display mt-1 text-[20px] font-semibold leading-none text-gold">
                  {formatAmount(presale.bonusQrs, 0)}
                </p>
                <p className="tnum mt-1 text-[12px] text-muted-2">on {formatAmount(presale.qrsPurchased, 0)} bought</p>
              </div>
            </div>

            {presale.paid ? (
              <p className="mt-4 rounded-xl bg-success-soft px-3.5 py-2.5 text-[13.5px] text-success">
                Refund paid on {new Date(presale.paid.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} —{" "}
                {formatAmount(presale.paid.credited, 2)} {presale.paid.currency} onto your card.
              </p>
            ) : (
              <Button size="lg" className="mt-4" onClick={() => setRefundOpen(true)}>
                Take {formatAmount(presale.refundXlm, 2)} XLM refund to a card
              </Button>
            )}

            <SimulatedNotice className="mt-4">
              <span className="font-semibold text-primary">Both bonuses are simulated.</span> The refund is credited inside
              ITDB and converted to your card&rsquo;s currency — no XLM leaves your wallet, and the ×2 drop is shown as an
              entitlement rather than moved on chain.
            </SimulatedNotice>
          </div>
        </section>
      )}

      {s && (
        <>
          <MultiplierBanner token="QRS" multiplier={s.yield.milestone} scales="daily yield" />
          <section className="flex flex-col gap-3">
            <SectionHeader title="QRS milestones" />
            <MilestoneList milestones={s.milestones} />
          </section>
        </>
      )}

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
              <LedgerLine label="Backing" value={`${s.backing.gramsPerToken} g per QRS`} valueClassName="font-medium" sub={`${formatKg(s.backing.totalKg)} over ${formatAmount(s.backing.totalSupply, 0)} tokens`} />
              <LedgerLine label="Gold price" value={`${formatCurrency(s.gold.usdPerKg)} / kg`} valueClassName="font-medium" />
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

      {presale && !presale.paid && (
        <CollectPanel
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          program="qrs"
          pendingUsd={presale.refundUsd}
          cards={cards}
          ledgerCards={ledger.cards}
          onConfirm={claimRefund}
          variant={{
            title: "Pre-sale refund",
            heading: "Refund paid",
            intro: `${formatAmount(presale.refundXlm, 4)} XLM — ${presale.refundPct}% of your pre-sale spend — converted to your card's currency at today's rate. Simulated: no XLM leaves your wallet.`,
            cardsOnly: true,
            footnote: { label: "Bonus", value: "Early bird" },
          }}
        />
      )}

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
