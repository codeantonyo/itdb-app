"use client";

import { useState } from "react";
import { ChevronRight, Minus, Plus } from "lucide-react";
import type { AtmSummary } from "@/app/api/atms/route";
import { AtmMap, type Region } from "@/components/atms/atm-map";
import { AppBar } from "@/components/layout/app-bar";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { GoldDust } from "@/components/vault/vault-map";
import { Panel } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/client/use-json";
import { formatAmount } from "@/lib/format";
import {
  ATMS_PRICE_XLM,
  ATMS_SUPPLY,
  ATM_CITIES,
  ATM_REGIONS,
  ATM_STAGES,
  ATM_TIERS,
  CENTRAL_BANK,
  COUNCIL,
  PRESALE_HOURS,
  dailyCrypto,
  flagOf,
  tierMax,
} from "@/lib/itdb/atms";
import { cn } from "@/lib/utils";

const fmt = (n: number) => formatAmount(n, 0);
const coins = (list: { code: string; amount: number }[]) => list.map((c) => `${fmt(c.amount)} ${c.code}`).join(" · ");
const when = (t: number) =>
  new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function AtmsPage() {
  // Every 10 s, so a city filling up shows while the page is open.
  const atms = useJson<AtmSummary>("/api/atms", 10_000);
  const s = atms.data;
  const [view, setView] = useState<"map" | "cities">("map");
  const [region, setRegion] = useState<Region>("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);

  const left = (c: string) => s?.remaining[c] ?? 50;
  const sel = selected && ATM_CITIES.find((c) => c.city === selected);

  return (
    <div className="flex flex-col gap-5">
      <AppBar back title="ITDB ATMS" subtitle="Own the network. Earn the fees." />

      {/* ---------------- The network ---------------- */}
      <section className="panel-navy engrave relative overflow-hidden px-4 pb-5 pt-6">
        <GoldDust />
        <div className="relative">
          <h1 className="font-display text-center text-[26px] font-semibold leading-tight tracking-tight text-gold">
            ITDB ATMS
            <span className="block text-[15px] font-semibold tracking-[0.22em] text-gold-light">GLOBAL NETWORK</span>
          </h1>
          <p className="mt-2 text-center text-[13px] text-muted">32 countries · 80 cities · 50 ATMs per city</p>
          <div className="mt-2 flex items-center justify-center gap-5 text-[13.5px]">
            <p className="text-primary">
              Total ATMs: <span className="tnum font-semibold">{fmt(s?.total ?? 4000)}</span>
            </p>
            <span className="h-3 w-px bg-hairline" />
            <p className="text-primary">
              Available:{" "}
              <span className="tnum font-semibold text-gold">{s ? fmt(s.total - s.placed) : "—"}</span>
            </p>
          </div>

          <Segmented
            className="mx-auto mt-4 max-w-[280px]"
            value={view}
            onChange={setView}
            options={[
              { value: "map", label: "Map" },
              { value: "cities", label: "Cities" },
            ]}
          />

          {view === "map" ? (
            <>
              <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {(["All", ...ATM_REGIONS] as Region[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRegion(r)}
                    aria-pressed={region === r}
                    className={cn(
                      "tap shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold",
                      region === r ? "bg-gold-soft text-gold" : "bg-elevated text-muted",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <AtmMap
                region={region}
                remaining={s?.remaining}
                selected={selected}
                onSelect={(c) => setSelected((prev) => (prev === c ? null : c))}
              />
              {sel ? (
                <button
                  onClick={() => setPlacing(sel.city)}
                  className="surface mt-3 flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="text-[20px] leading-none">{flagOf(sel.country)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-primary">
                      {sel.city} — {left(sel.city) === 0 ? "FULL" : `${left(sel.city)} left`}
                    </span>
                    <span className="block text-[12.5px] text-muted">Tap to place your ATMs here</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-2" />
                </button>
              ) : (
                <p className="mt-2 text-center text-[12.5px] text-muted">
                  Tap a gold pin, or zoom into a region. Grey pins are full.
                </p>
              )}
            </>
          ) : (
            <CityList s={s} onPick={setPlacing} />
          )}
        </div>
      </section>

      {atms.error && !s && <NetworkNotice message={atms.error} onRetry={atms.refresh} />}
      {!s ? <Skeleton className="h-[160px] rounded-2xl" /> : <YourAtms s={s} onEdit={setPlacing} />}
      {s && <YourRewards s={s} />}
      {s && <PresaleBonuses s={s} />}
      <Roadmap s={s} />
      <Tiers s={s} />

      {s && placing && (
        <PlacePanel s={s} city={placing} onClose={() => setPlacing(null)} onSaved={atms.refresh} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CityList({ s, onPick }: { s: AtmSummary | null; onPick: (city: string) => void }) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      {ATM_REGIONS.map((r) => (
        <div key={r}>
          <p className="label mb-1.5">{r}</p>
          <div className="surface divide-y divide-hairline">
            {ATM_CITIES.filter((c) => c.region === r).map((c) => {
              const n = s?.remaining[c.city] ?? 50;
              return (
                <button
                  key={c.city}
                  disabled={n === 0}
                  onClick={() => onPick(c.city)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left disabled:opacity-50"
                >
                  <span className="text-[17px] leading-none">{flagOf(c.country)}</span>
                  <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-primary">{c.city}</span>
                  <span className={cn("tnum text-[13px] font-semibold", n === 0 ? "text-muted-2" : "text-gold")}>
                    {n === 0 ? "FULL" : `${n} left`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlacePanel({ s, city, onClose, onSaved }: { s: AtmSummary; city: string; onClose: () => void; onSaved: () => void }) {
  const mineHere = s.placements.find((p) => p.city === city)?.count ?? 0;
  const placedMine = s.placements.reduce((t, p) => t + p.count, 0);
  const max = Math.min(mineHere + (s.remaining[city] ?? 0), mineHere + Math.max(s.allowed - placedMine, 0));
  const [count, setCount] = useState(Math.min(Math.max(mineHere, 1), Math.max(max, 0)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = ATM_CITIES.find((x) => x.city === city)!;

  const save = async (n: number) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/atms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, count: n }),
      });
      const data = (await r.json()) as { error?: string };
      if (r.ok) {
        onSaved();
        onClose();
      } else setError(data.error ?? "That did not work.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
      onSaved();
    }
  };

  return (
    <Panel open title={`${flagOf(c.country)} ${city}`} onClose={busy ? undefined : onClose}>
      <p className="text-[13.5px] text-muted">
        {s.remaining[city] === 0 ? "FULL" : `${s.remaining[city]} of ${s.perCity} ATMs left`} · you have {mineHere} here
      </p>
      {max === 0 && mineHere === 0 ? (
        <p className="mt-4 rounded-xl bg-elevated px-4 py-3 text-[13.5px] text-muted">
          {s.allowed === 0
            ? "Owning an ATM starts at Tier 1 — 1,000 ITDBATMS."
            : "Every ATM you own is placed. Take some back from another city, or reach the next tier."}
        </p>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-center gap-5">
            <button onClick={() => setCount((n) => Math.max(n - 1, 0))} className="tap flex size-11 items-center justify-center rounded-full bg-elevated" aria-label="One fewer">
              <Minus className="size-5" />
            </button>
            <span className="tnum min-w-[72px] text-center font-display text-[40px] font-semibold text-primary">{count}</span>
            <button onClick={() => setCount((n) => Math.min(n + 1, max))} className="tap flex size-11 items-center justify-center rounded-full bg-elevated" aria-label="One more">
              <Plus className="size-5" />
            </button>
          </div>
          <p className="mt-2 text-center text-[12.5px] text-muted-2">Up to {max} here</p>
          <button
            disabled={busy || count === mineHere}
            onClick={() => save(count)}
            className="cta mt-5 flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold disabled:opacity-60"
          >
            {busy ? "Saving…" : count === 0 ? `Remove my ATMs from ${city}` : `Own ${count} ATM${count === 1 ? "" : "s"} in ${city}`}
          </button>
        </>
      )}
      {error && <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-3 text-[13.5px] text-danger">{error}</p>}
    </Panel>
  );
}

function YourAtms({ s, onEdit }: { s: AtmSummary; onEdit: (city: string) => void }) {
  const placed = s.placements.reduce((t, p) => t + p.count, 0);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Your ATMs" note={s.allowed > 0 ? `${placed} of ${fmt(s.allowed)} placed` : undefined} />
      <div className="surface p-5">
        {s.holding === null ? (
          <p className="text-[13.5px] text-muted">We could not read your ITDBATMS balance just now — pull to refresh.</p>
        ) : s.allowed === 0 ? (
          <p className="text-[13.5px] leading-relaxed text-muted">
            You hold {fmt(s.holding)} ITDBATMS. Owning ATMs starts at Tier 1 — 1,000 ITDBATMS at {ATMS_PRICE_XLM} XLM each.
          </p>
        ) : (
          <>
            <p className="font-display text-[34px] font-semibold leading-none text-gold">{fmt(s.allowed)} ATMs</p>
            <p className="tnum mt-2 text-[13px] text-muted">
              Tier {s.tier}: {s.baseAtms}
              {s.multiplier > 1 && ` × ${s.multiplier} pre-sale multiplier`}
              {s.waveExtra > 0 && ` + ${fmt(s.waveExtra)} from the milestone wave`}
            </p>
            {s.placements.length > 0 && (
              <div className="mt-4 divide-y divide-hairline border-t border-hairline">
                {s.placements.map((p) => (
                  <button key={p.city} onClick={() => onEdit(p.city)} className="flex w-full items-center gap-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-primary">{p.city}</span>
                    <span className="tnum text-[14px] text-primary">{p.count}</span>
                    <ChevronRight className="size-4 text-muted-2" />
                  </button>
                ))}
              </div>
            )}
            {placed < s.allowed && (
              <p className="mt-3 text-[12.5px] text-muted-2">
                {fmt(s.allowed - placed)} still to place — choose cities on the map or in the list, as many per city as you like.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function YourRewards({ s }: { s: AtmSummary }) {
  if (!s.rewards) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Your rewards" note={`Tier ${s.tier}`} />
      <div className="surface p-5">
        <p className="text-[13px] text-muted">Daily app balance</p>
        <p className="font-display mt-0.5 text-[30px] font-semibold leading-none text-primary">${fmt(s.rewards.daily)} / day</p>
        <p className="label mt-4">Daily crypto rewards</p>
        <p className="tnum mt-1 text-[13.5px] leading-relaxed text-primary">{coins(s.rewards.crypto)}</p>
        <p className="mt-4 text-[13.5px] text-primary">
          ATM return: <span className="font-semibold text-gold">{s.rewards.returnPct}%</span> of cash withdrawals
          {s.wave && s.wave.extraReturnPct > 0 && ` + ${s.wave.extraReturnPct}% from the milestone wave`}
        </p>
        {s.wave && (
          <div className="mt-4 border-t border-hairline pt-4">
            <p className="label">Milestone bonuses — {s.wave.pct}% sold</p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <p className="tnum text-[13.5px] text-primary">+{fmt(s.wave.bonusTokens)} bonus ITDBATMS</p>
              {s.wave.tokensSent > 0 ? (
                <a
                  href={`https://stellar.expert/explorer/public/tx/${s.wave.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[12px] font-bold text-success"
                >
                  Sent to your wallet ✓
                </a>
              ) : (
                <span className="shrink-0 text-[12px] font-semibold text-gold">Being sent to your wallet</span>
              )}
            </div>
            <div className="mt-2 flex items-start justify-between gap-3">
              <p className="tnum text-[13.5px] leading-relaxed text-primary">
                {coins(s.wave.crypto.filter((c) => c.amount > 0))}
                {s.wave.crypto.some((c) => c.amount > 0) && " · "}
                {s.wave.goldKg} kg gold to your vault
              </p>
              <span className="shrink-0 text-[12px] font-bold text-success">
                {s.wave.creditedAt ? "Credited ✓" : ""}
              </span>
            </div>
            {s.wave.creditedAt && (
              <p className="mt-1 text-[12px] text-muted-2">
                Credited to your account {when(s.wave.creditedAt)} — see Portfolio.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function PresaleBonuses({ s }: { s: AtmSummary }) {
  const p = s.presale;
  const holder = s.presaleBought >= ATM_TIERS[0].min;
  const status = p.open
      ? `Open now — ends ${when(p.endsAt)}.`
      : p.ended
        ? `Ended ${when(p.endsAt)}.`
        : `Starts ${when(p.startsAt)}.`;
  const rows: { title: string; detail: string; mine?: string }[] = [
    {
      title: "1 · Your tokens doubled",
      detail: "Hold 1,000+ ITDBATMS from the pre-sale and receive 100% bonus tokens when it ends. Your tier updates with them.",
      mine: holder ? `+${fmt(s.bonusTokens)} ITDBATMS${p?.ended ? "" : " when the pre-sale ends"}` : undefined,
    },
    {
      title: "2 · Your ATMs multiplied",
      detail: "1x for every 1,000 ITDBATMS bought in the pre-sale, on your tier's ATMs. 15,000 at Tier 3: 5 × 15 = 75 ATMs. The token doubling does not raise it again.",
      mine: holder ? `${s.multiplier}x` : undefined,
    },
    {
      title: "3 · Crypto rewards",
      detail: "For every 1,000 ITDBATMS: 5,000 XLM · 2,500 USDC · 2,500 EURC · 2,500 XRP · 1,000 each of DAI, BUSD, TUSD, PYUSD, FDUSD.",
      mine: holder ? coins(s.presaleCrypto) : undefined,
    },
    {
      title: "4 · Council seat",
      detail: `The first ${COUNCIL.seats} holders to reach Tier ${COUNCIL.tier} get a permanent seat on the ITDB Vault & ITDB ATMS Council.`,
      mine: s.council ? "Your seat is secured" : undefined,
    },
    {
      title: "5 · Central Bank status",
      detail: `The first ${CENTRAL_BANK.seats} holders to reach Tier ${CENTRAL_BANK.tier} receive Central Bank status — 100% of fees.`,
      mine: s.centralBank ? "Central Bank status secured" : undefined,
    },
  ];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Pre-sale bonuses" note={`${PRESALE_HOURS} hours`} />
      <p className="px-1 text-[13px] text-muted">{status}</p>
      <div className="surface divide-y divide-hairline">
        {rows.map((r) => (
          <div key={r.title} className="px-4 py-3.5">
            <p className="text-[14.5px] font-semibold text-primary">{r.title}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{r.detail}</p>
            {r.mine && <p className="tnum mt-1.5 text-[13px] font-semibold text-gold">{r.mine}</p>}
          </div>
        ))}
      </div>
      {holder && (
        <p className="px-1 text-[12.5px] text-muted-2">You bought {fmt(s.presaleBought)} ITDBATMS in the pre-sale.</p>
      )}
    </section>
  );
}

function Roadmap({ s }: { s: AtmSummary | null }) {
  const pct = s?.soldPct ?? 0;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Milestone Roadmap" note={s?.sold != null ? `${fmt(s.sold)} of ${fmt(ATMS_SUPPLY)} sold` : undefined} />
      <div className="surface p-5">
        <div className="flex justify-between text-[13px]">
          <span className="font-semibold text-primary">{pct.toFixed(1)}% sold</span>
          <span className="text-muted">bonuses update — they never add</span>
        </div>
        <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-elevated" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="ITDBATMS sold">
          <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light" style={{ width: `${pct}%` }} />
          {[25, 50, 75].map((m) => (
            <span key={m} className="absolute inset-y-0 w-px bg-hairline" style={{ left: `${m}%` }} aria-hidden="true" />
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {ATM_STAGES.map((w) => {
            const reached = pct >= w.pct;
            return (
              <div key={w.pct} className={cn("rounded-2xl p-4", reached ? "bg-gold-soft" : "bg-elevated")}>
                <p className="flex items-center justify-between text-[14.5px] font-semibold text-primary">
                  <span>
                    {w.medal} {w.pct}% sold out — {w.name}
                  </span>
                  <span className={cn("text-[11px] font-bold uppercase tracking-wide", reached ? "text-success" : "text-muted-2")}>
                    {reached ? "Active" : "Locked"}
                  </span>
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-[13px] leading-relaxed text-muted">
                  <li>🎁 {w.bonusPct}% bonus tokens</li>
                  <li>🏧 {w.extraPer10k} extra ATMs for every 10,000 ITDBATMS held</li>
                  <li>💰 {coins(w.cryptoPer1000)} for every 1,000 ITDBATMS held</li>
                  <li>🥇 {w.goldKg} kg of gold added to your vault</li>
                  {w.extraReturnPct > 0 && <li>📈 Extra {w.extraReturnPct}% return on all ATM cash withdrawals</li>}
                  {w.perks.map((x) => (
                    <li key={x}>💎 {x}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[12.5px] text-muted-2">Every holder of 1,000+ ITDBATMS is eligible, whenever they bought.</p>
      </div>
    </section>
  );
}

function Tiers({ s }: { s: AtmSummary | null }) {
  const [open, setOpen] = useState<number | null>(s?.tier ?? null);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Tiers & rewards" note="10 tiers" />
      <div className="surface divide-y divide-hairline">
        {ATM_TIERS.map((t) => {
          const max = tierMax(t);
          const mine = s?.tier === t.tier;
          return (
            <div key={t.tier}>
              <button onClick={() => setOpen(open === t.tier ? null : t.tier)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className={cn("flex size-8 items-center justify-center rounded-full text-[13px] font-bold", mine ? "bg-gold text-gold-ink" : "bg-elevated text-primary")}>
                  {t.tier}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="tnum block text-[14.5px] font-semibold text-primary">
                    {fmt(t.min)}
                    {max ? ` – ${fmt(max)}` : "+"} ITDBATMS
                  </span>
                  <span className="tnum block text-[12.5px] text-muted">
                    ${fmt(t.daily)}/day · {t.returnPct}% return · {t.atms} ATM{t.atms > 1 ? "s" : ""}
                  </span>
                </span>
                <ChevronRight className={cn("size-4 text-muted-2 transition-transform", open === t.tier && "rotate-90")} />
              </button>
              {open === t.tier && (
                <div className="px-4 pb-4 text-[13px] leading-relaxed text-muted">
                  <p>💰 Daily app balance: ${fmt(t.daily)} / day</p>
                  <p className="tnum">🪙 Daily crypto: {coins(dailyCrypto(t))}</p>
                  <p>💵 ATM return: {t.returnPct}% from cash withdrawals</p>
                  <p>🏦 Ownership: {t.atms} ATM{t.atms > 1 ? "s" : ""}{t.tier === 1 ? " (any city)" : ""}</p>
                  {t.bonus && <p>🎁 Bonus: {t.bonus}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
