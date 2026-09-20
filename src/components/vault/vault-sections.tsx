"use client";

import { Check, Lock } from "lucide-react";
import type { VaultSummary } from "@/app/api/vault/route";
import { SectionHeader } from "@/components/shared/section-header";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The reference sections of the vault page: what a vault is, what it
 * holds, what it pays, and what unlocks as the sale fills.
 *
 * Every figure is simulated, and the page says so once at the bottom
 * rather than hedging each line.
 */

const money = (n: number, ccy: string) =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${ccy}`;

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
                className={cn(
                  "tnum shrink-0 text-[13px] font-semibold",
                  left === 0 ? "text-muted-2" : "text-gold",
                )}
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

export function WhatItHolds({ s }: { s: VaultSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="What your vault holds" note={`${s.metals.length} metals`} />
      <div className="surface p-5">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Physical metals stored in your name, audited and insured — not digital representations.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {s.metals.map((m) => (
            <span
              key={m}
              className="rounded-md bg-gold-soft px-2 py-1 text-[12px] font-semibold text-gold"
            >
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

export function WhatYouReceive({ s }: { s: VaultSummary }) {
  const mine = s.mine;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="What you receive" />
      <div className="surface p-5">
        {mine && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-elevated px-3.5 py-3">
              <p className="text-[12px] text-muted">Weekly payout</p>
              <p className="tnum mt-0.5 text-[15px] font-semibold text-gold">
                {money(mine.weekly.USD, "USD")}
              </p>
              <p className="tnum text-[12px] text-muted-2">
                {money(mine.weekly.EUR, "EUR")} · {money(mine.weekly.GBP, "GBP")}
              </p>
            </div>
            <div className="rounded-2xl bg-elevated px-3.5 py-3">
              <p className="text-[12px] text-muted">Monthly metals</p>
              <p className="tnum mt-0.5 text-[15px] font-semibold text-gold">
                {formatAmount(mine.monthlyMetalGrams, 0)} g each
              </p>
              <p className="text-[12px] text-muted-2">across {s.metals.length} metals</p>
            </div>
          </div>
        )}
        <ul className="flex flex-col gap-2.5">
          {s.benefits.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-[14.5px] text-primary">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-gold text-gold-ink">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function EarlyBird({ s }: { s: VaultSummary }) {
  const { earlyBird, economics, mine } = s;
  // Shown while the window is open, and afterwards to anyone who caught it.
  if (!earlyBird.open && !mine?.earlyBird) return null;
  const refund = mine?.refundXlm ?? (economics.xlmPerVault * earlyBird.refundPct) / 100;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Early bird"
        note={mine?.earlyBird ? "yours" : earlyBird.open ? "48 hours" : undefined}
      />
      <div className="surface p-5">
        <p className="tnum text-[13.5px] text-muted">
          Set buy orders at {economics.priceXlm} XLM per ITDBVAULT —{" "}
          {formatAmount(economics.xlmPerVault, 0)} XLM a vault.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <Perk
            title={`${earlyBird.refundPct}% XLM refund in-app`}
            detail={`${formatAmount(refund, 0)} XLM back inside the app.`}
          />
          <Perk
            title="Double rewards"
            detail="Every payout — currency and metals — is doubled, for life."
          />
          <Perk
            title="Metal starter pack"
            detail={(mine?.earlyBird ? mine.starterPack : null)
              ? mine!.starterPack.map((m) => `${formatAmount(m.grams, 0)} g ${m.metal}`).join(" · ")
              : "50 g gold · 500 g silver · 50 g platinum · 25 g palladium"}
          />
          <Perk
            title="Preferred vault number"
            detail="First pick of any number from 1 to 500. Latecomers take what is left."
          />
          <Perk
            title="50% off the holding tiers"
            detail="Every ITDBONE and QRS tier threshold is halved on your account."
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

export function Milestones({ s }: { s: VaultSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Milestone bonuses"
        note={`${formatAmount(s.soldPct, 0)}% sold`}
      />
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
