"use client";

import { useState } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";
import type { VaultSummary } from "@/app/api/vault/route";
import { SectionHeader } from "@/components/shared/section-header";
import { Panel } from "@/components/ui/panel";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The reference sections of the vault page: tier and rewards, the early
 * bird, the milestones, and what a vault is.
 *
 * Every figure is simulated, and the page says so once at the bottom
 * rather than hedging each line.
 */

const money = (n: number, ccy: string) =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${ccy}`;
const g = (n: number) => `${formatAmount(n, 0)} g`;
const day = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/* ------------------------------------------------------------------ */
/*  Tier                                                               */
/* ------------------------------------------------------------------ */

export function Tiers({ s }: { s: VaultSummary }) {
  const [open, setOpen] = useState(false);
  const t = s.tier;
  const floor = t?.rangeMin ?? 0;
  const ceiling = s.next?.min ?? null;
  const pct =
    ceiling === null
      ? 1
      : Math.max(0, Math.min(1, (s.tierCounted - floor) / Math.max(ceiling - floor, 1)));

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Vault tier" note={s.discounted ? "50% off — early bird" : undefined} />

      <div className="surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display flex size-11 items-center justify-center rounded-full bg-gold text-[18px] font-semibold text-gold-ink">
              {t ? t.tier : "–"}
            </span>
            <div>
              <p className="text-[16px] font-semibold text-primary">
                {t ? `${t.medal} Tier ${t.tier}` : "Below Tier 1"}
              </p>
              <p className="tnum text-[13px] text-muted">
                {s.holding === null ? "Balance unavailable" : `${formatAmount(s.holding, 2)} ITDBVAULT`}
                {s.discounted && ` · counted as ${formatAmount(s.tierCounted, 0)}`}
              </p>
            </div>
          </div>
          {s.rewards && (
            <p className="tnum text-right text-[15px] font-semibold text-gold">
              {money(s.rewards.weekly.USD, "USD")}
              <span className="block text-[11.5px] font-medium text-muted-2">weekly</span>
            </p>
          )}
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-700"
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
        <p className="tnum mt-2 text-[13px] text-muted">
          {s.next
            ? `${formatAmount(s.next.needed, 0)} ITDBVAULT more for ${s.next.medal} Tier ${s.next.tier}`
            : t
              ? "Top tier reached"
              : `${formatAmount(s.tiers[0].min, 0)} ITDBVAULT opens Tier 1`}
        </p>

        <button
          onClick={() => setOpen(true)}
          className="tap mt-3 flex w-full items-center justify-between text-[14px] font-semibold text-gold"
        >
          View all {s.tiers.length} tiers
          <ChevronRight className="size-4" />
        </button>
      </div>

      <Panel open={open} title="ITDBVAULT tiers" onClose={() => setOpen(false)}>
        <div className="flex flex-col divide-y divide-hairline">
          {s.tiers.map((x) => {
            const yours = t?.tier === x.tier;
            return (
              <div key={x.tier} className={cn("py-3", yours && "-mx-2 rounded-xl bg-gold-soft px-2")}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[15px] font-semibold text-primary">
                    {x.medal} Tier {x.tier}
                    {yours && (
                      <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-gold">
                        Yours
                      </span>
                    )}
                  </p>
                  <p className="tnum text-[14px] font-semibold text-gold">
                    {money(x.weekly.USD, "USD")} / wk
                  </p>
                </div>
                <p className="tnum text-[12.5px] text-muted">
                  {formatAmount(x.rangeMin, 0)}
                  {x.rangeMax === null ? "+" : ` – ${formatAmount(x.rangeMax, 0)}`} ITDBVAULT
                </p>
                <p className="tnum text-[12.5px] text-muted-2">
                  {x.vaults} vault{x.vaults > 1 ? "s" : ""} · {x.metalsStored} metals · {x.burnPct}% burn
                  · ~${formatAmount(x.estMonthlyUsd / 1_000_000, 2)}M a month
                </p>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  What the member's tier actually pays                               */
/* ------------------------------------------------------------------ */

export function WhatYouReceive({ s }: { s: VaultSummary }) {
  const r = s.rewards;
  const t = s.tier;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Your rewards"
        note={r ? [r.earlyBirdMultiplier > 1 && "×2 early bird", r.metalBoost.multiplier > 1 && `metals ×${r.metalBoost.multiplier}`].filter(Boolean).join(" · ") || undefined : undefined}
      />
      <div className="surface p-5">
        {r && t ? (
          <>
            <p className="label">Weekly currency</p>
            <p className="tnum mt-1 text-[15px] font-semibold text-gold">
              {money(r.weekly.USD, "USD")} · {money(r.weekly.EUR, "EUR")} · {money(r.weekly.GBP, "GBP")}
            </p>

            <p className="label mt-4">Monthly metals</p>
            {r.metalBoost.multiplier > 1 && r.metalBoost.until && (
              <p className="mt-1 text-[12.5px] text-success">
                Milestone boost ×{r.metalBoost.multiplier} until {day(r.metalBoost.until)}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {r.metals.map((m) => (
                <span key={m.metal} className="tnum rounded-md bg-elevated px-2 py-1 text-[12px] text-primary">
                  {g(m.grams)} {m.metal}
                </span>
              ))}
            </div>

            <p className="label mt-4">Monthly metal-backed tokens</p>
            <div className="mt-1">
              {r.tokens.map((x) => (
                <div
                  key={x.code}
                  className="flex items-center justify-between border-t border-hairline py-2 first:border-t-0"
                >
                  <span className="text-[14px] font-semibold text-primary">{x.code}</span>
                  <span className="tnum text-[13px] text-muted">
                    {formatAmount(x.amount, 0)} · {x.metal}
                  </span>
                </div>
              ))}
            </div>

            {s.bonusTokens > 0 && (
              <p className="tnum mt-4 rounded-xl bg-gold-soft px-3.5 py-2.5 text-[13.5px] text-gold">
                +{formatAmount(s.bonusTokens, 0)} bonus ITDBVAULT from the milestone
              </p>
            )}

            <p className="label mt-4">Ownership and benefits</p>
            <ul className="mt-1 flex flex-col gap-1.5">
              <Tick>{t.metalsStored} metals stored</Tick>
              {t.benefits.map((b) => (
                <Tick key={b}>{b}</Tick>
              ))}
            </ul>
            <p className="tnum mt-3 text-[12.5px] text-muted-2">
              {t.burnPct}% burn on every transaction · indicative ~$
              {formatAmount(t.estMonthlyUsd / 1_000_000, 2)}M a month before early-bird doubling
            </p>
          </>
        ) : (
          <p className="text-[13.5px] leading-relaxed text-muted">
            Rewards start at Tier 1. Every vault owner receives:
          </p>
        )}

        {!t && (
          <ul className="mt-3 flex flex-col gap-2">
            {s.benefits.map((b) => (
              <Tick key={b}>{b}</Tick>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[13.5px] text-primary">
      <Check className="mt-0.5 size-3.5 shrink-0 text-gold" strokeWidth={3} />
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Early bird — the window is closed; shown to those who have it      */
/* ------------------------------------------------------------------ */

export function EarlyBird({ s }: { s: VaultSummary }) {
  const { earlyBird, mine } = s;
  if (!mine && !earlyBird.open) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Early bird" note={mine ? "yours" : "open"} />
      <div className="surface p-5">
        <p className="tnum text-[13.5px] text-muted">
          {mine
            ? `You bought ${formatAmount(mine.xlmSpent, 2)} XLM of ITDBVAULT before the window closed on ${day(earlyBird.endsAt)}.`
            : `Buy orders at ${s.sale.priceXlm} XLM per ITDBVAULT, open until ${day(earlyBird.endsAt)}.`}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <Perk
            title={`${earlyBird.refundPct}% XLM refund in-app`}
            detail={
              mine
                ? `${formatAmount(mine.refundXlm, 2)} XLM — half of the ${formatAmount(mine.xlmSpent, 2)} XLM you spent.`
                : "Half of the XLM you spend, back inside the app."
            }
          />
          <Perk
            title="Double rewards"
            detail="Every payout — currency, metals and metal-backed tokens — doubled, for good."
          />
          <Perk
            title="Metal starter pack"
            detail="50 g gold · 500 g silver · 50 g platinum · 25 g palladium, credited to your vault."
          />
          <Perk
            title="Preferred vault numbers"
            detail="Pick any free number from 001 to 500 — and change the numbers of vaults you already hold."
          />
          <Perk
            title="50% off the vault tiers"
            detail={`Every ITDBVAULT tier threshold is halved — Tier 1 at ${formatAmount(
              s.tiers[0].min / 2,
              0,
            )} instead of ${formatAmount(s.tiers[0].min, 0)}.`}
          />
        </div>
      </div>
    </section>
  );
}

function Perk({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
        <Check className="size-3.5" strokeWidth={2.8} />
      </span>
      <div className="min-w-0">
        <p className="text-[14.5px] font-semibold text-primary">{title}</p>
        <p className="text-[13px] leading-snug text-muted">{detail}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Milestones                                                         */
/* ------------------------------------------------------------------ */

export function Milestones({ s }: { s: VaultSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Milestone bonuses" note={`${formatAmount(s.sale.soldPct, 1)}% sold`} />
      <div className="surface divide-y divide-hairline">
        {s.milestones.map((m) => {
          const reached = m.status === "active";
          return (
            <div key={m.id} className="flex items-start gap-3 px-4 py-3.5">
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  reached ? "bg-success-soft text-success" : "bg-elevated text-muted-2",
                )}
              >
                {reached ? (
                  <Check className="size-[15px]" strokeWidth={2.4} />
                ) : (
                  <Lock className="size-[14px]" strokeWidth={2.2} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn("text-[15px] font-semibold", reached ? "text-primary" : "text-muted")}>
                    {m.title}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide",
                      reached ? "bg-success-soft text-success" : "bg-elevated text-muted-2",
                    )}
                  >
                    {reached ? "Unlocked" : "Locked"}
                  </span>
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {m.detail.split(" · ").map((r) => (
                    <li key={r} className="text-[13px] leading-snug text-muted">
                      · {r}
                    </li>
                  ))}
                </ul>
                <p className="tnum mt-1 text-[12.5px] text-muted-2">{m.threshold}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Reference                                                          */
/* ------------------------------------------------------------------ */

export function WhatItHolds({ s }: { s: VaultSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="What a vault holds" note={`${s.metals.length} metals`} />
      <div className="surface p-5">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Physical metals stored in your name, audited and insured — not digital representations.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {s.metals.map((m) => (
            <span key={m} className="rounded-md bg-gold-soft px-2 py-1 text-[12px] font-semibold text-gold">
              {m}
            </span>
          ))}
        </div>

        <p className="label mt-5">Metal-backed assets</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Received, held and swapped in your vault, each backed 1:1 by physical metal.
        </p>
        <div className="mt-2.5">
          {s.backedAssets.map((a) => (
            <div
              key={a.code}
              className="flex items-center justify-between border-t border-hairline py-2.5 first:border-t-0"
            >
              <span className="text-[14.5px] font-semibold text-primary">{a.code}</span>
              <span className="tnum text-[13.5px] text-muted">
                {a.metal} · {a.oz} oz
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Branches({ s }: { s: VaultSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Branches" note={`${formatAmount(s.perCity, 0)} vaults each`} />
      <div className="surface divide-y divide-hairline">
        {s.branches.map((b) => {
          const left = s.remaining[b.city] ?? 0;
          return (
            <div key={b.city} className="flex items-center gap-3 px-4 py-3">
              <span className="text-[18px] leading-none">{b.flag}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-primary">{b.city}</span>
                <span className="block text-[12.5px] text-muted-2">{b.country}</span>
              </span>
              <span
                className={cn("tnum shrink-0 text-[13px] font-semibold", left === 0 ? "text-muted-2" : "text-gold")}
              >
                {left === 0 ? "Full" : `${formatAmount(left, 0)} left`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
