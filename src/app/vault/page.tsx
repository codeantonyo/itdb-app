"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, ShieldCheck } from "lucide-react";
import type { VaultSummary } from "@/app/api/vault/route";
import { AppBar } from "@/components/layout/app-bar";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { GoldDust, VaultMap } from "@/components/vault/vault-map";
import {
  Branches,
  EarlyBird,
  Milestones,
  Tiers,
  WhatItHolds,
  WhatYouReceive,
} from "@/components/vault/vault-sections";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/client/use-json";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

const label = (n: number) => `#${String(n).padStart(3, "0")}`;

/**
 * Count from the last value to the next one instead of jumping. Only the
 * displayed number moves — the real figure is whatever the server said.
 */
function useCountTo(target: number | null, ms = 900): number {
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
      const eased = 1 - (1 - p) ** 3;
      setShown(p < 1 ? Math.round(start + (target - start) * eased) : null);
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return shown ?? target ?? 0;
}

/** A free-number field shared by claiming and editing. */
function useNumberField(taken: number[], total: number, own?: number) {
  const [raw, setRaw] = useState("");
  const parsed = Number.parseInt(raw, 10);
  const ownedByOther = taken.includes(parsed) && parsed !== own;
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= total && !ownedByOther;
  const hint =
    raw === ""
      ? `Any free number, 001 to ${String(total).padStart(3, "0")}`
      : valid
        ? `${label(parsed)} is free`
        : ownedByOther
          ? `${label(parsed)} is already owned`
          : `Numbers run from 001 to ${String(total).padStart(3, "0")}`;
  return { raw, setRaw, value: valid ? parsed : null, hint, invalid: raw !== "" && !valid };
}

async function send(method: "POST" | "PATCH", body: object) {
  const r = await fetch("/api/vault", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as { error?: string };
  return r.ok ? null : (data.error ?? "That did not work.");
}

export default function VaultPage() {
  const vault = useJson<VaultSummary>("/api/vault", 30_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const s = vault.data;
  const available = useCountTo(s?.available ?? null);
  const num = useNumberField(s?.takenNumbers ?? [], s?.total ?? 500);

  const held = s?.vaults.length ?? 0;
  const canClaim = !!s && held < s.allowed && s.available > 0;
  // Derived, so a city that fills while the page is open drops out of the
  // selection instead of failing at the moment of claiming.
  const city = canClaim && picked && (s?.remaining[picked] ?? 0) > 0 ? picked : null;

  const run = async (method: "POST" | "PATCH", body: object, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const err = await send(method, body);
      if (err) setError(err);
      else after?.();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
      vault.refresh(); // success or not, the counts may have moved
    }
  };

  const claim = () =>
    city &&
    run("POST", { city, ...(s?.canChooseNumbers && num.value ? { number: num.value } : {}) }, () => {
      setPicked(null);
      num.setRaw("");
    });

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
            onSelect={canClaim ? (c) => setPicked((prev) => (prev === c ? null : c)) : undefined}
          />
        </div>
      </section>

      {vault.error && !s && <NetworkNotice message={vault.error} onRetry={vault.refresh} />}

      {/* ---------------- Your vaults ---------------- */}
      {s ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Your vaults"
            note={s.allowed > 0 ? `${held} of ${s.allowed}` : undefined}
          />

          {s.vaults.length > 0 && (
            <div className="surface divide-y divide-hairline">
              {s.vaults.map((v) => (
                <div key={v.number} className="flex items-center gap-3.5 px-4 py-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                    <ShieldCheck className="size-[19px]" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="tnum text-[15.5px] font-semibold text-primary">
                      Vault {label(v.number)} — {v.city}
                    </p>
                    <p className="text-[12.5px] text-muted">
                      Since{" "}
                      {new Date(v.at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  {s.canChooseNumbers && (
                    <button
                      onClick={() => setEditing(v.number)}
                      className="tap flex items-center gap-1 text-[13px] font-semibold text-gold"
                      aria-label={`Change vault ${label(v.number)}`}
                    >
                      <Pencil className="size-3.5" />
                      Change
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canClaim ? (
            <div className="flex flex-col gap-2">
              {s.canChooseNumbers && (
                <label className="surface flex items-center gap-3 p-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-primary">
                      Your vault number <span className="text-gold">· early bird</span>
                    </span>
                    <span className="block text-[12.5px] text-muted">{num.hint}</span>
                  </span>
                  <input
                    value={num.raw}
                    onChange={(e) => num.setRaw(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    inputMode="numeric"
                    placeholder="007"
                    aria-label="Vault number"
                    aria-invalid={num.invalid}
                    className="tnum inset w-[72px] shrink-0 bg-transparent px-3 py-2 text-center text-[16px] font-semibold text-primary outline-none"
                  />
                </label>
              )}

              <button
                onClick={claim}
                disabled={busy || !city || num.invalid}
                className="vault-cta cta flex h-[56px] w-full items-center justify-center rounded-2xl text-[15.5px] font-bold uppercase tracking-[0.14em] disabled:opacity-60"
              >
                <span className="relative z-[2]">
                  {busy
                    ? "Claiming…"
                    : city
                      ? `Claim ${held > 0 ? "another vault" : "your vault"} in ${city}`
                      : "Choose a city on the map"}
                </span>
              </button>
              <p className="text-center text-[12.5px] text-muted-2">
                {city
                  ? `${formatAmount(s.remaining[city] ?? 0, 0)} of ${formatAmount(s.perCity, 0)} left in ${city}` +
                    (s.canChooseNumbers ? "" : " · your number is assigned at random")
                  : `${s.allowed - held} more to choose — any cities, or several in one`}
              </p>
            </div>
          ) : (
            <p className="surface p-4 text-[13.5px] leading-relaxed text-muted">
              {s.allowed === 0
                ? s.holding === null
                  ? "We could not read your ITDBVAULT balance just now — pull to refresh."
                  : `Owning a vault starts at Tier 1 — ${formatAmount(s.tiers[0].min, 0)} ITDBVAULT${
                      s.canChooseNumbers ? `, or ${formatAmount(s.tiers[0].min / 2, 0)} for early birds` : ""
                    }.`
                : held >= s.allowed
                  ? `You hold every vault your tier gives you. Reaching the next tier adds more.`
                  : "Every vault in the network has been claimed."}
            </p>
          )}

          {error && (
            <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[13.5px] text-danger">{error}</p>
          )}
        </section>
      ) : (
        <Skeleton className="h-[140px] rounded-2xl" />
      )}

      {s && (
        <>
          <Tiers s={s} />
          <EarlyBird s={s} />
          <Milestones s={s} />
          <WhatYouReceive s={s} />
          <WhatItHolds s={s} />
          <Branches s={s} />
        </>
      )}

      <p className="px-1 text-[12.5px] leading-relaxed text-muted-2">
        {formatAmount(s?.total ?? 500, 0)} vaults, {formatAmount(s?.perCity ?? 50, 0)} in each of the ten branches,
        numbered 001 to 500 and unique across the network.{" "}
        <span className="font-semibold text-muted">
          Every figure here is simulated — no metal is allocated and no unit is reserved.
        </span>
      </p>

      {s && editing !== null && (
        <EditVault
          s={s}
          vault={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(body) => run("PATCH", { vault: editing, ...body }, () => setEditing(null))}
        />
      )}
    </div>
  );
}

/** An early bird moves one of their vaults to another number or city. */
function EditVault({
  s,
  vault,
  busy,
  onClose,
  onSave,
}: {
  s: VaultSummary;
  vault: number;
  busy: boolean;
  onClose: () => void;
  onSave: (body: { number?: number; city?: string }) => void;
}) {
  const current = s.vaults.find((v) => v.number === vault);
  const num = useNumberField(s.takenNumbers, s.total, vault);
  const [city, setCity] = useState(current?.city ?? "");
  if (!current) return null;

  const cityOk = city === current.city || (s.remaining[city] ?? 0) > 0;
  const changed = (num.value !== null && num.value !== vault) || city !== current.city;

  return (
    <Panel open title={`Change vault ${label(vault)}`} onClose={busy ? undefined : onClose}>
      <label className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-primary">New number</span>
          <span className="block text-[12.5px] text-muted">{num.hint}</span>
        </span>
        <input
          value={num.raw}
          onChange={(e) => num.setRaw(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          inputMode="numeric"
          placeholder={String(vault).padStart(3, "0")}
          aria-label="New vault number"
          aria-invalid={num.invalid}
          className="tnum inset w-[72px] shrink-0 bg-transparent px-3 py-2 text-center text-[16px] font-semibold text-primary outline-none"
        />
      </label>

      <p className="label mt-5">City</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {s.branches.map((b) => {
          const full = b.city !== current.city && (s.remaining[b.city] ?? 0) <= 0;
          return (
            <button
              key={b.city}
              disabled={full}
              onClick={() => setCity(b.city)}
              aria-pressed={city === b.city}
              className={cn(
                "tap rounded-xl px-3 py-2.5 text-left text-[13.5px]",
                city === b.city ? "bg-gold-soft font-semibold text-gold" : "bg-elevated text-primary",
                full && "opacity-40",
              )}
            >
              {b.flag} {b.city}
              {full && <span className="block text-[11px] text-muted-2">Full</span>}
            </button>
          );
        })}
      </div>

      <button
        disabled={busy || !changed || num.invalid || !cityOk}
        onClick={() =>
          onSave({
            ...(num.value !== null && num.value !== vault ? { number: num.value } : {}),
            ...(city !== current.city ? { city } : {}),
          })
        }
        className="cta mt-5 flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </Panel>
  );
}
