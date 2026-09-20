"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { VaultSummary } from "@/app/api/vault/route";
import { AppBar } from "@/components/layout/app-bar";
import { NetworkNotice } from "@/components/shared/network-notice";
import { GoldDust, VaultMap } from "@/components/vault/vault-map";
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

  const s = vault.data;
  const available = useCountTo(s?.available ?? null);

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/vault", { method: "POST" });
      const data = (await r.json()) as VaultSummary & { error?: string };
      if (r.ok) vault.refresh();
      else setError(data.error ?? "That did not work.");
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

          <VaultMap className="mt-3" />
        </div>
      </section>

      {vault.error && !s && <NetworkNotice message={vault.error} onRetry={vault.refresh} />}

      {s ? (
        claimed ? (
          <section className="surface flex items-center gap-3.5 p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <ShieldCheck className="size-[21px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-semibold text-primary">
                Vault #{s.mine!.index + 1} — {s.mine!.city}
              </p>
              <p className="text-[13px] text-muted">
                Claimed{" "}
                {new Date(s.mine!.at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </section>
        ) : (
          <button
            onClick={claim}
            disabled={busy || s.available === 0}
            className="vault-cta cta flex h-[56px] w-full items-center justify-center rounded-2xl text-[15.5px] font-bold uppercase tracking-[0.14em] disabled:opacity-60"
          >
            <span className="relative z-[2]">
              {busy ? "Claiming…" : s.available === 0 ? "All vaults claimed" : "Claim your vault"}
            </span>
          </button>
        )
      ) : (
        <Skeleton className="h-[56px] rounded-2xl" />
      )}

      {error && (
        <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[13.5px] text-danger">{error}</p>
      )}

      <p className="px-1 text-[12.5px] leading-relaxed text-muted-2">
        Each vault is one of {formatAmount(s?.total ?? 500, 0)} on the ITDBVAULT network, assigned to a city as it is
        claimed. One vault per account.
      </p>
    </div>
  );
}
