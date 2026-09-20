"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { VaultSummary } from "@/app/api/vault/route";
import { AppBar } from "@/components/layout/app-bar";
import { NetworkNotice } from "@/components/shared/network-notice";
import { GoldDust, VaultMap } from "@/components/vault/vault-map";
import {
  Branches,
  EarlyBird,
  Milestones,
  Tiers,
  WhatItHolds,
  WhatYouReceive,
} from "@/components/vault/vault-sections";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/client/use-json";
import { formatAmount } from "@/lib/format";

/**
 * Count from the last value to the next one instead of jumping.
 *
 * Only the displayed number moves — the real figure is whatever the
 * server returned, so a claim is never misreported while the animation
 * is still catching up.
 */
function useCountTo(target: number | null, ms = 900): number {
  // null means "not animating" — render the real figure straight through.
  const [shown, setShown] = useState<number | null>(null);
  const from = useRef<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    const start = from.current;
    from.current = target;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (start === null || start === target || reduced) return;

    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const p = Math.min((now - t0) / ms, 1);
      const eased = 1 - (1 - p) ** 3; // ease-out: quick, then settling
      setShown(p < 1 ? Math.round(start + (target - start) * eased) : null);
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return shown ?? target ?? 0;
}

export default function VaultPage() {
  const vault = useJson<VaultSummary>("/api/vault", 30_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [wantedNumber, setWantedNumber] = useState("");

  const s = vault.data;
  const available = useCountTo(s?.available ?? null);

  // Derived, so a city that fills up while the page is open stops being
  // the selection rather than failing at the moment of claiming.
  const city = picked && (s?.remaining[picked] ?? 0) > 0 ? picked : null;

  // Choosing a number is an early-bird privilege; the field only shows
  // while the window is open, and only a free number is ever sent.
  const taken = new Set(s?.takenNumbers ?? []);
  const parsed = Number.parseInt(wantedNumber, 10);
  const numberValid =
    Number.isInteger(parsed) && parsed >= 1 && parsed <= (s?.total ?? 500) && !taken.has(parsed);
  const numberWanted = numberValid ? parsed : null;

  const claim = async () => {
    if (!city) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, ...(numberWanted ? { number: numberWanted } : {}) }),
      });
      const data = (await r.json()) as VaultSummary & { error?: string };
      if (r.ok) {
        setPicked(null);
        setWantedNumber("");
        vault.refresh();
      } else {
        setError(data.error ?? "That did not work.");
        vault.refresh(); // a rejection usually means the counts moved
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const claimed = s?.mine != null;

  return (
    <div className="flex flex-col gap-5">
      <AppBar back title="ITDBVAULT" subtitle="Global vault network" />

      <section className="panel-navy engrave relative overflow-hidden px-4 pb-5 pt-6">
        <GoldDust />

        <div className="relative">
          <h1 className="font-display text-center text-[26px] font-semibold leading-tight tracking-tight text-gold">
            ITDB VAULT
            <span className="block text-[15px] font-semibold tracking-[0.22em] text-gold-light">
              GLOBAL NETWORK
            </span>
          </h1>

          <div className="mt-3 flex items-center justify-center gap-5 text-[13.5px]">
            <p className="text-primary">
              Total Vaults: <span className="tnum font-semibold">{formatAmount(s?.total ?? 500, 0)}</span>
            </p>
            <span className="h-3 w-px bg-hairline" />
            <p className="text-primary">
              Available:{" "}
              {s ? (
                <span className="tnum font-semibold text-gold">{formatAmount(available, 0)}</span>
              ) : (
                <span className="text-muted-2">—</span>
              )}
            </p>
          </div>

          <VaultMap
            className="mt-3"
            remaining={s?.remaining}
            selected={city}
            onSelect={claimed ? undefined : (c) => setPicked((prev) => (prev === c ? null : c))}
          />
        </div>
      </section>

      {vault.error && !s && <NetworkNotice message={vault.error} onRetry={vault.refresh} />}

      {s ? (
        claimed ? (
          <section className="surface p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <ShieldCheck className="size-[21px]" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-semibold text-primary">
                  Vault #{s.mine!.number} — {s.mine!.city}
                </p>
                <p className="text-[13px] text-muted">
                  Claimed{" "}
                  {new Date(s.mine!.at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {s.mine!.earlyBird && " · Early bird"}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-elevated px-3.5 py-3">
                <p className="text-[12px] text-muted">ITDBVAULT</p>
                <p className="tnum mt-0.5 text-[17px] font-semibold text-gold">
                  {formatAmount(s.mine!.tokens, 0)}
                </p>
                {s.mine!.tokens > s.mine!.baseTokens && (
                  <p className="tnum text-[12px] text-muted-2">
                    {formatAmount(s.mine!.baseTokens, 0)} +{formatAmount(s.economics.bonusPct, 0)}%
                  </p>
                )}
              </div>
              <div className="rounded-2xl bg-elevated px-3.5 py-3">
                <p className="text-[12px] text-muted">{s.mine!.earlyBird ? "XLM refund" : "Paid"}</p>
                <p className="tnum mt-0.5 text-[17px] font-semibold text-gold">
                  {formatAmount(s.mine!.earlyBird ? s.mine!.refundXlm : s.mine!.xlmPaid, 0)} XLM
                </p>
                <p className="tnum text-[12px] text-muted-2">
                  of {formatAmount(s.mine!.xlmPaid, 0)} XLM
                </p>
              </div>
            </div>
          </section>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              onClick={claim}
              disabled={busy || !city || s.available === 0}
              className="vault-cta cta flex h-[56px] w-full items-center justify-center rounded-2xl text-[15.5px] font-bold uppercase tracking-[0.14em] disabled:opacity-60"
            >
              <span className="relative z-[2]">
                {busy
                  ? "Claiming…"
                  : s.available === 0
                    ? "All vaults claimed"
                    : city
                      ? `Claim your vault in ${city}`
                      : "Choose a city on the map"}
              </span>
            </button>
            <p className="text-center text-[12.5px] text-muted-2">
              {city
                ? `${formatAmount(s.remaining[city] ?? 0, 0)} of ${formatAmount(s.perCity, 0)} left in ${city}`
                : "Tap any glowing pin to pick where your vault is held"}
            </p>

            {s.earlyBird.open && (
              <label className="surface flex items-center gap-3 p-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-primary">
                    Preferred vault number
                  </span>
                  <span className="block text-[12.5px] text-muted">
                    {wantedNumber === ""
                      ? `Early birds pick any free number, 1 to ${formatAmount(s.total, 0)}`
                      : numberValid
                        ? `#${numberWanted} is free — it is yours`
                        : taken.has(parsed)
                          ? `#${parsed} is already owned`
                          : `Pick a number between 1 and ${formatAmount(s.total, 0)}`}
                  </span>
                </span>
                <input
                  value={wantedNumber}
                  onChange={(e) => setWantedNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  inputMode="numeric"
                  placeholder="001"
                  aria-label="Preferred vault number"
                  aria-invalid={wantedNumber !== "" && !numberValid}
                  className="tnum inset w-[72px] shrink-0 bg-transparent px-3 py-2 text-center text-[16px] font-semibold text-primary outline-none"
                />
              </label>
            )}
          </div>
        )
      ) : (
        <Skeleton className="h-[56px] rounded-2xl" />
      )}

      {error && (
        <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[13.5px] text-danger">{error}</p>
      )}

      {s && (
        <>
          <Tiers s={s} />
          <EarlyBird s={s} />
          <Milestones s={s} />
          <WhatItHolds s={s} />
          <WhatYouReceive s={s} />
          <Branches s={s} />
        </>
      )}

      <p className="px-1 text-[12.5px] leading-relaxed text-muted-2">
        {formatAmount(s?.total ?? 500, 0)} vaults, {formatAmount(s?.perCity ?? 50, 0)} in each of the ten branches, at{" "}
        {formatAmount(s?.economics.xlmPerVault ?? 200, 0)} XLM each out of a{" "}
        {formatAmount(s?.economics.saleXlm ?? 100_000, 0)} XLM sale. One vault per account.{" "}
        <span className="font-semibold text-muted">
          Every figure here is simulated — no metal is allocated and no unit is reserved.
        </span>
      </p>
    </div>
  );
}
