"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, Lock, Sparkles } from "lucide-react";
import type { MegaSummary } from "@/app/api/mega-airdrop/route";
import { AppBar } from "@/components/layout/app-bar";
import { LedgerLine } from "@/components/shared/ledger-line";
import { SectionHeader } from "@/components/shared/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/client/use-json";
import { formatAmount } from "@/lib/format";
import { MEGA_ALLOCATION, MEGA_BANNER, MEGA_SUCCESS, MEGA_TITLE } from "@/lib/itdb/mega-airdrop";
import { cn } from "@/lib/utils";

/** How long the allocation animation runs, whatever the server's speed. */
const CLAIM_MS = 3_000;

export default function MegaAirdropPage() {
  const mega = useJson<MegaSummary>("/api/mega-airdrop", 120_000);
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const s = mega.data;

  const claim = async () => {
    setPhase("loading");
    setError(null);
    try {
      const [r] = await Promise.all([
        fetch("/api/mega-airdrop", { method: "POST" }),
        new Promise((done) => setTimeout(done, CLAIM_MS)),
      ]);
      const data = (await r.json()) as { error?: string };
      if (r.ok) {
        setPhase("done");
        mega.refresh();
      } else {
        setError(data.error ?? "The claim did not go through.");
        setPhase("idle");
      }
    } catch {
      setError("Network error — try again.");
      setPhase("idle");
    }
  };

  const claimed = phase === "done" || !!s?.claimedAt;
  const reached = !!s && s.soldPct >= s.milestonePct;

  return (
    <div className="flex flex-col gap-6">
      <AppBar back title={MEGA_TITLE} subtitle="ITDB Vault holders" />

      <p className="flex items-start gap-2.5 rounded-2xl border border-hairline-gold bg-gold-soft px-4 py-3 text-[13.5px] font-bold leading-snug text-gold">
        <Sparkles className="mt-px size-4 shrink-0" />
        {MEGA_BANNER}
      </p>

      {/* ---------------- Hero: the vault opens, the milestone ---------------- */}
      <section className="panel-navy engrave p-6 text-center">
        <VaultOpening />
        <h1 className="font-display mt-4 text-[30px] font-semibold leading-none tracking-wide text-gold">
          {MEGA_TITLE}
        </h1>

        <div className="mt-5 text-left">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className={cn("font-semibold", reached ? "text-success" : "text-muted")}>
              {s ? (reached ? `${s.milestonePct}% Milestone Reached` : `Unlocks at ${s.milestonePct}% sold`) : "…"}
            </span>
            <span className="tnum text-muted">{s ? `${s.soldPct.toFixed(1)}% sold` : ""}</span>
          </div>
          <div
            className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-elevated"
            role="progressbar"
            aria-label="ITDB Vault sale progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={s ? Math.round(s.soldPct) : undefined}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-[width] duration-700"
              style={{ width: `${s?.soldPct ?? 0}%` }}
            />
            <span className="absolute inset-y-0 left-1/2 w-px bg-primary/60" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* ---------------- What is in it ---------------- */}
      {MEGA_ALLOCATION.map((g) => (
        <section key={g.title} className="flex flex-col gap-3">
          <SectionHeader title={g.title} />
          <div className="surface px-4">
            {g.lines.map((l) => (
              <LedgerLine
                key={l.code}
                label={
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-primary">{l.code}</span>
                    {l.name.toUpperCase() !== l.code && <span className="truncate text-[13px]">{l.name}</span>}
                  </span>
                }
                value={`${formatAmount(l.amount, 0)} ${l.unit}`}
              />
            ))}
          </div>
        </section>
      ))}

      {/* ---------------- Claim ---------------- */}
      <div className="flex flex-col gap-3">
        {claimed && (
          <div className="rounded-2xl bg-success-soft px-4 py-4 text-[14.5px] leading-relaxed text-success" role="status">
            <p className="font-semibold">{MEGA_SUCCESS}</p>
            <Link href="/portfolio" className="mt-2 inline-block font-bold underline underline-offset-2">
              Open Portfolio
            </Link>
          </div>
        )}
        {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">{error}</p>}

        {!s ? (
          <Skeleton className="h-[54px] rounded-2xl" />
        ) : claimed ? (
          <button disabled className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-success-soft text-[16px] font-semibold text-success">
            <Check className="size-5" strokeWidth={2.6} />
            Claimed
          </button>
        ) : s.eligible ? (
          <button
            onClick={claim}
            disabled={phase === "loading"}
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-success text-[16px] font-bold text-white transition-opacity active:scale-[0.985] disabled:opacity-80"
          >
            {phase === "loading" ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Allocating to your vault…
              </>
            ) : (
              "Claim Mega Airdrop"
            )}
          </button>
        ) : (
          <button
            disabled
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-elevated text-[15.5px] font-semibold text-muted-2"
          >
            <Lock className="size-4" />
            {s.held === null ? "Could not read your wallet — pull to refresh" : "Locked — ITDB Vault holders only"}
          </button>
        )}
        {s && !s.eligible && !claimed && (
          <p className="px-1 text-center text-[13px] text-muted-2">
            Hold any amount of ITDBVAULT in a linked wallet to unlock the claim.{" "}
            <Link href="/vault" className="font-semibold text-gold">
              ITDB Vault
            </Link>
          </p>
        )}
      </div>

      <p className="px-1 text-[12.5px] leading-relaxed text-muted-2">
        Holdings are read from every wallet linked to your account. Every figure here is simulated — nothing is sent on
        chain and no metal is reserved.
      </p>
    </div>
  );
}

/**
 * A vault door that unlocks and swings open onto gold. The door is an HTML
 * layer, not an SVG group, because 3D transforms only work reliably on
 * HTML elements.
 */
function VaultOpening() {
  const bolts = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <div className="mega-vault relative mx-auto h-[150px] w-[200px]" aria-hidden="true">
      <svg viewBox="0 0 200 150" className="absolute inset-0 size-full">
        <defs>
          <radialGradient id="mega-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--m-gold-light)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--m-gold)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="32" y="3" width="136" height="144" rx="14" fill="var(--m-elevated, #1a2436)" stroke="var(--m-gold)" strokeOpacity="0.55" />
        <g className="inside">
          <circle cx="100" cy="75" r="60" fill="#0b1220" />
          <circle cx="100" cy="75" r="58" fill="url(#mega-glow)" />
          {/* stacked bars: 3 / 2 / 1 */}
          {[
            [72, 88], [95, 88], [118, 88],
            [83, 76], [106, 76],
            [95, 64],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="21" height="10" rx="1.5" fill="var(--m-gold)" stroke="var(--m-gold-light)" strokeWidth="0.8" />
          ))}
        </g>
      </svg>

      <div className="door absolute left-[38px] top-[13px] size-[124px]">
        <svg viewBox="0 0 124 124" className="size-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]">
          <circle cx="62" cy="62" r="61" fill="#2a3448" stroke="var(--m-gold)" strokeWidth="2" />
          <circle cx="62" cy="62" r="48" fill="none" stroke="var(--m-gold)" strokeOpacity="0.45" strokeWidth="1.5" />
          {bolts.map((a) => (
            <circle key={a} cx={62 + Math.cos(a) * 55} cy={62 + Math.sin(a) * 55} r="2.6" fill="var(--m-gold-light)" />
          ))}
          <g className="wheel">
            {[0, 60, 120].map((deg) => (
              <line
                key={deg}
                x1="62"
                y1="36"
                x2="62"
                y2="88"
                stroke="var(--m-gold-light)"
                strokeWidth="4"
                strokeLinecap="round"
                transform={`rotate(${deg} 62 62)`}
              />
            ))}
            <circle cx="62" cy="62" r="17" fill="none" stroke="var(--m-gold)" strokeWidth="3" />
            <circle cx="62" cy="62" r="6" fill="var(--m-gold)" />
          </g>
        </svg>
      </div>
    </div>
  );
}
