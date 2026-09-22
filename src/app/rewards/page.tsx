"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Gift, Lock, Sparkles } from "lucide-react";
import type { AirdropSummary } from "@/lib/server/airdrop";
import type { ItdbSummary } from "@/app/api/itdb/route";
import type { ItdboneSummary } from "@/app/api/itdbone/route";
import type { QrsSummary } from "@/app/api/qrs/route";
import type { VaultSummary } from "@/app/api/vault/route";
import { AppBar } from "@/components/layout/app-bar";
import { ExactFigure } from "@/components/shared/exact-figure";
import { NetworkNotice } from "@/components/shared/network-notice";
import { CollectPanel, type CollectOutcome } from "@/components/tokens/collect-panel";
import { EarlyBirdBanner } from "@/components/tokens/milestones";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/client/auth";
import { useCards } from "@/lib/client/cards";
import { formatRemaining } from "@/lib/client/cards";
import { usePortfolio } from "@/lib/client/portfolio";
import { useJson } from "@/lib/client/use-json";
import { useWalletLedger } from "@/lib/client/wallet-ledger";
import { formatAmount, formatCurrency, formatExactCurrency } from "@/lib/format";
import type { ActiveMultiplier, Milestone } from "@/lib/itdb/milestones";
import type { YieldComputed } from "@/lib/server/accrual";

type Program = "itdbone" | "qrs";

/** Progress toward the next holding tier for one token. */
interface TierProgressInfo {
  tier: number | null;
  /** Lowest balance still inside the current tier */
  floor: number;
  /** Balance that would open the next tier (null = top tier) */
  ceiling: number | null;
  balance: number;
  nextTier: number | null;
  unit: string;
}

/**
 * A token's own rewards block. Each token gets one, and nothing inside it
 * is ever computed from another token's balance or bonuses.
 */
function TokenRewards({
  token,
  href,
  headline,
  headlineNote,
  progress,
  multiplier,
  milestones,
  children,
}: {
  token: string;
  href: string;
  headline: number;
  headlineNote: string;
  progress: TierProgressInfo;
  multiplier: ActiveMultiplier;
  milestones: Milestone[];
  children?: React.ReactNode;
}) {
  const active = milestones.filter((m) => m.status === "active").length;
  const locked = milestones.filter((m) => m.status === "locked").length;
  const span = progress.ceiling === null ? 0 : Math.max(progress.ceiling - progress.floor, 1);
  const pct =
    progress.ceiling === null
      ? 1
      : Math.max(0, Math.min(1, (progress.balance - progress.floor) / span));

  return (
    <section className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={href} className="flex items-center gap-1 text-[15px] font-semibold text-primary">
            {token} Rewards
            <ChevronRight className="size-4 text-muted-2" />
          </Link>
          <p className="tnum text-[13px] text-muted">
            {progress.tier !== null
              ? `Tier ${progress.tier} · ${formatAmount(progress.balance, 2)} ${progress.unit}`
              : `Below Tier 1 · ${formatAmount(progress.balance, 2)} ${progress.unit}`}
          </p>
        </div>
        {multiplier.value > 1 && (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-gold-soft px-2 py-1 text-[12px] font-bold text-gold">
            <Sparkles className="size-3.5" strokeWidth={2.2} />×{formatAmount(multiplier.value, 0)}
          </span>
        )}
      </div>

      <ExactFigure
        compact={formatCurrency(headline)}
        exact={formatExactCurrency(headline)}
        className="font-display mt-3 block text-[30px] font-semibold leading-none text-primary"
        exactClassName="text-[22px]"
      />
      <p className="mt-1 text-[13px] text-muted">{headlineNote}</p>

      {/* Progress to the next tier for THIS token */}
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-700"
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <p className="tnum mt-2 text-[13px] text-muted">
        {progress.ceiling !== null && progress.nextTier !== null
          ? `${formatAmount(Math.max(progress.ceiling - progress.balance, 0), 2)} ${progress.unit} more to Tier ${progress.nextTier}`
          : "Top tier reached"}
      </p>

      {/* Status labels, in Craig's words: ACTIVE green, LOCKED grey + padlock */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {active > 0 && (
          <span className="rounded-md bg-success-soft px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-success">
            {active} active
          </span>
        )}
        {locked > 0 && (
          <span className="flex items-center gap-1 rounded-md bg-elevated px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-2">
            <Lock className="size-3" strokeWidth={2.4} />
            {locked} locked
          </span>
        )}
        <Link href={href} className="tap ml-auto text-[13px] font-semibold text-gold">
          {token} milestones
        </Link>
      </div>

      {children}
    </section>
  );
}

/**
 * ITDBVAULT in the same shape as the other three tokens.
 *
 * An early bird's tier is read at twice their holding. The card shows
 * what they actually hold, so the thresholds are scaled down by the same
 * factor instead — the "more to Tier N" line then states real tokens.
 */
function VaultRewards({ v }: { v: VaultSummary }) {
  const held = v.holding ?? 0;
  const scale = held > 0 ? v.tierCounted / held : 1;
  return (
    <TokenRewards
      token="ITDBVAULT"
      href="/vault"
      headline={v.rewards?.weekly.USD ?? 0}
      headlineNote={v.rewards ? "weekly currency payout" : "rewards start at Tier 1"}
      multiplier={{ value: v.rewards?.earlyBirdMultiplier ?? 1, from: null, next: null }}
      milestones={v.milestones}
      progress={{
        tier: v.tier?.tier ?? null,
        floor: (v.tier?.rangeMin ?? 0) / scale,
        ceiling: v.next ? v.next.min / scale : null,
        nextTier: v.next?.tier ?? null,
        balance: held,
        unit: "ITDBVAULT",
      }}
    >
      <Link href="/vault" className="inset mt-4 flex items-center gap-2.5 px-3.5 py-3 transition-opacity active:opacity-70">
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-primary">
            {v.vaults.length > 0
              ? `${v.vaults.length} of ${v.allowed} vault${v.allowed > 1 ? "s" : ""} chosen`
              : v.allowed > 0
                ? `Choose your ${v.allowed} vault${v.allowed > 1 ? "s" : ""}`
                : "Open the vault network"}
          </span>
          <span className="tnum block text-[12.5px] text-muted">
            {v.rewards
              ? `${formatAmount(v.rewards.metals[0]?.grams ?? 0, 0)} g gold a month` +
                (v.mine ? ` · ${formatAmount(v.mine.refundXlm, 2)} XLM early-bird refund` : "")
              : `${formatAmount(v.sale.soldPct, 1)}% of the sale sold`}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-2" />
      </Link>
    </TokenRewards>
  );
}

/** The collect button for a yield programme. */
function CollectButton({ y, onCollect }: { y: YieldComputed; onCollect: () => void }) {
  const eligible = y.tier !== null;
  const ready = eligible && y.pendingUsd >= y.minCollectUsd && y.cooldownRemainingMs === 0;
  return (
    <Button size="lg" className="mt-4" disabled={!ready} onClick={onCollect}>
      {!eligible
        ? "Hold more to earn"
        : y.cooldownRemainingMs > 0
          ? `Available in ${formatRemaining(y.cooldownRemainingMs)}`
          : y.pendingUsd < y.minCollectUsd
            ? `Collect from ${formatCurrency(y.minCollectUsd)}`
            : `Collect ${formatCurrency(y.pendingUsd)}`}
    </Button>
  );
}

export default function RewardsPage() {
  const { session } = useAuth();
  const portfolio = usePortfolio();
  const ledger = useWalletLedger(!!session);
  const { cards } = useCards(session?.address ?? null);

  const itdb = useJson<ItdbSummary>("/api/itdb", 60_000);
  const itdbone = useJson<ItdboneSummary>("/api/itdbone", 60_000);
  const qrs = useJson<QrsSummary>("/api/qrs", 60_000);
  const vault = useJson<VaultSummary>("/api/vault", 60_000);
  const airdrop = useJson<AirdropSummary>("/api/airdrop", 120_000);
  const [collecting, setCollecting] = useState<Program | null>(null);

  const collect = async (program: Program, destination: string): Promise<CollectOutcome> => {
    try {
      const r = await fetch(`/api/${program}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collect", to: destination }),
      });
      const data = (await r.json()) as { error?: string; usd?: number; credited?: number; currency?: string };
      if (r.ok) {
        (program === "itdbone" ? itdbone : qrs).refresh();
        ledger.refresh();
        portfolio.refresh();
        return { ok: true, usd: data.usd, credited: data.credited, currency: data.currency };
      }
      return { ok: false, error: data.error };
    } catch {
      return { ok: false, error: "Network error — try again." };
    }
  };

  const pendingTotal = (itdbone.data?.yield.pendingUsd ?? 0) + (qrs.data?.yield.pendingUsd ?? 0);
  const airdropValue = airdrop.data
    ? airdrop.data.claimed
      ? airdrop.data.remainingUsd
      : airdrop.data.grantUsd
    : 0;
  const loading = itdbone.loading && qrs.loading;
  const anyError = itdb.error ?? itdbone.error ?? qrs.error ?? airdrop.error;

  return (
    <div className="flex flex-col">
      <AppBar title="Rewards" subtitle="Yield and airdrops in one place" />

      {/* ---------------- Ready to collect ---------------- */}
      <section className="panel-navy engrave mt-1 p-5">
        <p className="text-[13px] font-medium text-muted">Ready to collect</p>
        {loading ? (
          <Skeleton className="mt-2 h-9 w-40 opacity-30" />
        ) : (
          <ExactFigure
            compact={formatCurrency(pendingTotal)}
            exact={formatExactCurrency(pendingTotal)}
            className="font-display mt-1 block text-[36px] font-semibold leading-none text-primary"
            exactClassName="text-[24px]"
          />
        )}
        <p className="mt-1.5 text-[13px] text-muted">Across ITDBONE and QRS daily yield</p>
      </section>

      {anyError && !itdbone.data && !qrs.data && (
        <NetworkNotice
          className="mt-4"
          message={anyError}
          onRetry={() => {
            itdb.refresh();
            itdbone.refresh();
            qrs.refresh();
            airdrop.refresh();
          }}
        />
      )}

      {itdb.data?.earlyBird && (
        <div className="mt-4">
          <EarlyBirdBanner multiplier={itdb.data.earlyBird.multiplier} />
        </div>
      )}

      {/* ---------------- Airdrop ---------------- */}
      <Link href="/airdrop" className="surface mt-4 flex items-center gap-3.5 p-4 transition-opacity active:opacity-70">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Gift className="size-[21px]" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-semibold text-primary">
            {airdrop.data?.title ?? "Founding Airdrop"}
          </span>
          <span className="block text-[13px] text-muted">
            {airdrop.data
              ? airdrop.data.claimed
                ? "Claimed · withdraw to a card"
                : airdrop.data.eligible
                  ? "You are eligible to claim"
                  : "Hold all three ITDB assets to claim"
              : "Checking eligibility…"}
          </span>
        </span>
        {airdropValue > 0 && (
          <span className="tnum shrink-0 text-[15px] font-semibold text-gold">{formatCurrency(airdropValue)}</span>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-2" />
      </Link>

      {/* ---------------- One section per token, never mixed ---------------- */}
      <div className="mt-4 flex flex-col gap-4">
        {itdb.data ? (
          <TokenRewards
            token="ITDB"
            href="/itdb"
            headline={itdb.data.basketUsd}
            headlineNote="reserve basket at live rates"
            multiplier={itdb.data.milestone}
            milestones={itdb.data.milestones}
            progress={{
              tier: itdb.data.tier?.tier ?? null,
              floor: itdb.data.tier?.min ?? 0,
              ceiling: itdb.data.next?.min ?? null,
              nextTier: itdb.data.next?.tier ?? null,
              balance: itdb.data.balance,
              unit: "ITDB",
            }}
          />
        ) : (
          <Skeleton className="h-[240px] rounded-[18px]" />
        )}

        {itdbone.data ? (
          <TokenRewards
            token="ITDBONE"
            href="/itdbone"
            headline={itdbone.data.yield.pendingUsd}
            headlineNote="daily yield ready to collect"
            multiplier={itdbone.data.yield.milestone}
            milestones={itdbone.data.milestones}
            progress={{
              tier: itdbone.data.yield.tier,
              floor: itdbone.data.tier?.rangeMin ?? 0,
              ceiling: itdbone.data.next?.rangeMin ?? null,
              nextTier: itdbone.data.next?.tier ?? null,
              balance: itdbone.data.yield.balance,
              unit: "ITDBONE",
            }}
          >
            <CollectButton y={itdbone.data.yield} onCollect={() => setCollecting("itdbone")} />
          </TokenRewards>
        ) : (
          <Skeleton className="h-[300px] rounded-[18px]" />
        )}

        {qrs.data ? (
          <TokenRewards
            token="QRS"
            href="/qrs"
            headline={qrs.data.yield.pendingUsd}
            headlineNote="daily yield ready to collect"
            multiplier={qrs.data.yield.milestone}
            milestones={qrs.data.milestones}
            progress={{
              tier: qrs.data.yield.tier,
              floor: qrs.data.tier?.min ?? 0,
              ceiling: qrs.data.next?.min ?? null,
              nextTier: qrs.data.next?.tier ?? null,
              balance: qrs.data.yield.balance,
              unit: "QRS",
            }}
          >
            <CollectButton y={qrs.data.yield} onCollect={() => setCollecting("qrs")} />
            {qrs.data.presale && !qrs.data.presale.paid && (
              <Link
                href="/qrs"
                className="inset mt-3 flex items-center gap-2.5 px-3.5 py-3 transition-opacity active:opacity-70"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-primary">
                    Early bird refund ready
                  </span>
                  <span className="tnum block text-[12.5px] text-muted">
                    {formatAmount(qrs.data.presale.refundXlm, 2)} XLM · {qrs.data.presale.refundPct}% of your pre-sale spend
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-2" />
              </Link>
            )}
          </TokenRewards>
        ) : (
          <Skeleton className="h-[300px] rounded-[18px]" />
        )}

        {vault.data ? (
          <VaultRewards v={vault.data} />
        ) : (
          <Skeleton className="h-[260px] rounded-[18px]" />
        )}
      </div>

      <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-muted-2">
        Yield counts from the day you first acquired each token on chain, and keeps building while you wait. Milestone
        bonuses apply to their own token; early-bird status applies across your account.
      </p>

      {collecting && (
        <CollectPanel
          open
          onClose={() => setCollecting(null)}
          program={collecting}
          pendingUsd={(collecting === "itdbone" ? itdbone.data : qrs.data)?.yield.pendingUsd ?? 0}
          cards={cards}
          ledgerCards={ledger.cards}
          onConfirm={(destination) => collect(collecting, destination)}
        />
      )}
    </div>
  );
}
