"use client";

import { useState } from "react";
import { ChevronRight, Lock, Unlock } from "lucide-react";
import type { I100Summary } from "@/app/api/itdb100/route";
import { AppBar } from "@/components/layout/app-bar";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/client/use-json";
import {
  I100_EARLY_DIVIDEND,
  I100_EARLY_PRICE_XLM,
  I100_EARLY_STEPS,
  I100_GATES,
  I100_PRICE_XLM,
  I100_SUPPLY,
  I100_TIERS,
  i100TierMax,
} from "@/lib/itdb/itdb100";
import { cn } from "@/lib/utils";

const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const usd = (n: number) => `$${n0(n)}`;
const grams = (g: number) => (g >= 1_000 ? `${g / 1_000} kg` : `${g} g`);

export default function Itdb100Page() {
  const q = useJson<I100Summary>("/api/itdb100", 30_000);
  const s = q.data;

  return (
    <div className="flex flex-col gap-5">
      <AppBar back title="ITDB 100" subtitle="Only up. Never down." />
      <Progress s={s} />
      {q.error && !s && <NetworkNotice message={q.error} onRetry={q.refresh} />}
      {!s && !q.error && <Skeleton className="h-[160px] rounded-2xl" />}
      {s && <Position s={s} />}
      {s && s.bonusTokens.length > 0 && <BonusTokens s={s} />}
      {s && s.tier && <Credited s={s} />}
      <EarlyBirds s={s} />
      <Gates s={s} />
      <Tiers s={s} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Progress({ s }: { s?: I100Summary | null }) {
  const pct = s?.soldPct ?? 0;
  return (
    <section className="panel-navy engrave p-5">
      <p className="text-[13px] font-medium text-muted">ITDB 100 sold</p>
      <p className="font-display mt-1 text-[52px] font-semibold leading-none text-gold">
        {s ? `${pct.toFixed(1)}%` : "—"}
      </p>
      <div
        className="relative mt-4 h-4 overflow-hidden rounded-full bg-elevated"
        role="progressbar"
        aria-label="ITDB 100 sold"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#c0c7d1] via-gold to-gold-light transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
        {[25, 50, 75].map((m) => (
          <span key={m} className="absolute inset-y-0 w-0.5 bg-[color:var(--m-ink)]/40" style={{ left: `${m}%` }} aria-hidden="true" />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {I100_GATES.map((g) => {
          const open = pct >= g.pct;
          return (
            <div
              key={g.pct}
              className={cn("rounded-xl px-1.5 py-2 text-center", open ? "bg-gold-soft" : "bg-elevated")}
            >
              <p className="text-[16px] leading-none">{g.medal}</p>
              <p className={cn("mt-1 text-[12px] font-bold", open ? "text-gold" : "text-muted")}>{g.pct}%</p>
              <p className={cn("text-[9.5px] font-bold uppercase tracking-wide", open ? "text-success" : "text-muted-2")}>
                {open ? "Unlocked" : "Locked"}
              </p>
            </div>
          );
        })}
      </div>
      <p className="tnum mt-3 text-[13px] text-muted">
        {s?.sold != null ? `${n0(s.sold)} of ${n0(I100_SUPPLY)} sold` : `${n0(I100_SUPPLY)} on sale`} · {I100_PRICE_XLM} XLM per
        token
      </p>
    </section>
  );
}

function Position({ s }: { s: I100Summary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Your position" note={s.tier ? `Tier ${s.tier}` : undefined} />
      <div className="surface p-5">
        {s.holding === null ? (
          <p className="text-[13.5px] text-muted">We could not read your ITDB 100 balance just now — pull to refresh.</p>
        ) : (
          <>
            <p className="tnum font-display text-[34px] font-semibold leading-none text-primary">
              {n0(s.counted)} <span className="text-[18px] text-muted">ITDB 100</span>
            </p>
            {s.pending > 0 && (
              <p className="tnum mt-1.5 text-[12.5px] text-muted">
                {n0(s.holding)} in your wallets + {n0(s.pending)} bonus on its way — both count for your tier
              </p>
            )}
            {s.tier ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-elevated px-3.5 py-3">
                    <p className="text-[12px] text-muted">Daily dividend</p>
                    <p className="tnum mt-0.5 text-[17px] font-semibold text-gold">{usd(s.dividend.perDay)}</p>
                    {s.dividend.multiplier > 1 && <p className="text-[11.5px] text-muted">{s.dividend.multiplier}x applied</p>}
                  </div>
                  <div className="rounded-2xl bg-elevated px-3.5 py-3">
                    <p className="text-[12px] text-muted">Earned so far</p>
                    <p className="tnum mt-0.5 text-[17px] font-semibold text-primary">{usd(s.dividend.accrued)}</p>
                  </div>
                </div>
                {s.next && (
                  <p className="tnum mt-3 text-[13px] text-muted">
                    {n0(s.next.needed)} more to Tier {s.next.tier}. 🔒 The Ratchet keeps Tier {s.tier} for good.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-[13.5px] text-muted">Tier 1 starts at {n0(I100_TIERS[0].min)} ITDB 100.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function BonusTokens({ s }: { s: I100Summary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Your bonus tokens" note="sent to your wallet" />
      <div className="surface divide-y divide-hairline">
        {s.bonusTokens.map((b) => {
          const g = I100_GATES.find((x) => x.pct === b.gate);
          return (
            <div key={`${b.kind}-${b.gate ?? 0}`} className="flex items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold text-primary">
                  {b.kind === "early" ? "Early bird — bonus + your tokens doubled" : `${g?.medal} ${g?.name}`}
                </span>
                <span className="tnum block text-[13px] text-muted">+{n0(b.due)} ITDB 100</span>
              </span>
              {b.sent >= b.due - 1e-6 ? (
                <a
                  href={`https://stellar.expert/explorer/public/tx/${b.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[12px] font-bold text-success"
                >
                  Sent ✓
                </a>
              ) : (
                <span className="shrink-0 text-[12px] font-semibold text-gold">Being sent</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Credited({ s }: { s: I100Summary }) {
  const c = s.credited;
  const rows: [string, string][] = [
    ["🎁 Welcome bonus", usd(c.welcome)],
    ["📈 Stock — shares of the 100", usd(c.stock)],
    ...(c.silverG ? [["🥈 Silver", grams(c.silverG)] as [string, string]] : []),
    ...(c.goldG ? [["🥇 Gold", grams(c.goldG)] as [string, string]] : []),
    ...(c.earlyUsd ? [["💰 Early-bird bonus", usd(c.earlyUsd)] as [string, string]] : []),
    ...c.metals.map((m) => [`✨ ${m.code}`, n0(m.amount)] as [string, string]),
  ];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Credited to you" note="automatically" />
      <div className="surface px-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 border-b border-hairline py-3 last:border-0">
            <span className="text-[14px] text-primary">{k}</span>
            <span className="tnum text-[14px] font-semibold text-gold">{v}</span>
          </div>
        ))}
      </div>
      {c.perks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {c.perks.map((p) => (
            <span key={p} className="rounded-full bg-gold-soft px-2.5 py-1 text-[12px] font-semibold text-gold">
              {p}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function EarlyBirds({ s }: { s?: I100Summary | null }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Early-bird bonuses" note={s?.early ? "you are an early bird" : undefined} />
      <div className="surface p-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-success-soft px-3.5 py-3">
            <p className="text-[12px] font-semibold text-success">🟢 Early birds</p>
            <p className="tnum text-[20px] font-semibold text-primary">{I100_EARLY_PRICE_XLM} XLM</p>
          </div>
          <div className="rounded-2xl bg-danger-soft px-3.5 py-3">
            <p className="text-[12px] font-semibold text-danger">🔴 Public ICO</p>
            <p className="tnum text-[20px] font-semibold text-primary">{I100_PRICE_XLM} XLM</p>
          </div>
        </div>
        <div className="mt-4 divide-y divide-hairline">
          {I100_EARLY_STEPS.map((x) => {
            const mine = s?.early && s.early.pct === x.pct;
            return (
              <div key={x.xlm} className={cn("flex items-center justify-between gap-3 py-2.5", mine && "font-semibold")}>
                <span className="tnum text-[13.5px] text-primary">💰 {n0(x.xlm)}+ XLM</span>
                <span className={cn("tnum text-right text-[13px]", mine ? "text-gold" : "text-muted")}>
                  +{x.pct}% free tokens + {usd(x.usd)}
                </span>
              </div>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-col gap-1 text-[13px] text-primary">
          <li>📌 For every early bird: {I100_EARLY_DIVIDEND}x daily dividend — for life</li>
          <li>⚡ First priority on every future phase</li>
          <li>✖️2 Your tokens doubled — you paid {I100_EARLY_PRICE_XLM}, the launch price is {I100_PRICE_XLM} XLM</li>
        </ul>
        {s?.early && (
          <p className="tnum mt-3 rounded-xl bg-gold-soft px-3.5 py-2.5 text-[13px] font-semibold text-gold">
            You bought {n0(s.early.tokens)} ITDB 100 for {n0(s.early.xlm)} XLM
            {s.early.pct ? ` — +${s.early.pct}% + ${usd(s.early.usd)}` : ""}, and your tokens doubled.
          </p>
        )}
      </div>
    </section>
  );
}

function Gates({ s }: { s?: I100Summary | null }) {
  const pct = s?.soldPct ?? 0;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Milestone gates" note="they add up" />
      <div className="flex flex-col gap-3">
        {I100_GATES.map((g) => {
          const open = pct >= g.pct;
          return (
            <div key={g.pct} className={cn("rounded-2xl p-4", open ? "bg-gold-soft" : "surface")}>
              <p className="flex items-center justify-between gap-2 text-[15px] font-semibold text-primary">
                <span>
                  {g.medal} {g.pct}% sold → {g.name.toUpperCase()}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide",
                    open ? "text-success" : "text-muted-2",
                  )}
                >
                  {open ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                  {open ? "Unlocked" : "Locked"}
                </span>
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-[13px] leading-relaxed text-muted">
                <li>🪙 +{g.bonusPct}% bonus tokens</li>
                <li>
                  💵 {g.dividend}x daily dividend{g.pct === 25 ? " — FOR LIFE" : g.pct === 100 ? " — the max" : ""}
                </li>
                {g.perks.map((p) => (
                  <li key={p}>🏛️ {p}</li>
                ))}
                <li>
                  ✨ {n0(g.metal.amount)} {g.metal.code} in your wallet
                </li>
              </ul>
            </div>
          );
        })}
      </div>
      <p className="px-1 text-[12.5px] text-muted-2">
        Credited to everyone who had bought when the gate opened. Bonus tokens are % of what you had bought by then.
      </p>
    </section>
  );
}

function Tiers({ s }: { s?: I100Summary | null }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Tier & reward system" note="10 tiers" />
      <div className="surface divide-y divide-hairline">
        {I100_TIERS.map((x) => {
          const max = i100TierMax(x);
          const mine = s?.tier === x.tier;
          return (
            <div key={x.tier}>
              <button
                onClick={() => setOpen(open === x.tier ? null : x.tier)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-[13px] font-bold",
                    mine ? "bg-gold text-gold-ink" : "bg-elevated text-primary",
                  )}
                >
                  {x.tier}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="tnum block text-[14.5px] font-semibold text-primary">
                    {n0(x.min)}
                    {max ? ` – ${n0(max)}` : "+"}
                  </span>
                  <span className="tnum block text-[12.5px] text-muted">
                    {usd(x.daily)}/day · {usd(x.welcome)} welcome
                  </span>
                </span>
                <ChevronRight className={cn("size-4 text-muted-2 transition-transform", open === x.tier && "rotate-90")} />
              </button>
              {open === x.tier && (
                <div className="tnum px-4 pb-4 text-[13px] leading-relaxed text-muted">
                  <p>💵 Daily dividend: {usd(x.daily)}</p>
                  <p>🎁 Welcome: {usd(x.welcome)}</p>
                  <p>📈 Stock: {usd(x.stock)} in shares of the 100</p>
                  <p>
                    🥈 {grams(x.silverG)} silver{x.goldG ? ` · 🥇 ${grams(x.goldG)} gold` : ""}
                  </p>
                  <p>⭐ {x.perk}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="px-1 text-center text-[12.5px] font-semibold text-gold">
        🏦 THE RATCHET IS ON AT EVERY TIER. 📈 ONLY UP. NEVER DOWN.
      </p>
    </section>
  );
}
