"use client";

import { useState } from "react";
import { Check, Copy, Share2, Trophy, UserPlus } from "lucide-react";
import type { ReferralSummary, RewardView } from "@/app/api/referral/route";
import { AppBar } from "@/components/layout/app-bar";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/client/use-json";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

const until = (t: number) =>
  new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function ReferralPage() {
  const ref = useJson<ReferralSummary>("/api/referral", 30_000);
  const s = ref.data;

  return (
    <div className="flex flex-col gap-5">
      <AppBar back title="Referrals" subtitle="ITDB for every referral who reaches Tier 2" />

      {ref.error && !s && <NetworkNotice message={ref.error} onRetry={ref.refresh} />}
      {!s && !ref.error && <Skeleton className="h-[220px] rounded-[20px]" />}

      {s && (
        <>
          <ShareCard s={s} />
          {s.addCodeUntil !== null && <AddCode until={s.addCodeUntil} onDone={ref.refresh} />}
          <MatchBonus s={s} />
          <YourReferrals s={s} />
          <Leaderboard s={s} />
          <Rules s={s} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ShareCard({ s }: { s: ReferralSummary }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const copy = async (what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? s.link : s.code);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked — the text is on screen to copy by hand */
    }
  };
  const share = async () => {
    try {
      await navigator.share?.({ title: "Join me on ITDB", text: `Use my code ${s.code}`, url: s.link });
    } catch {
      /* dismissed */
    }
  };

  return (
    <section className="panel-navy engrave p-5">
      <p className="text-[13px] font-medium text-muted">Your referral code</p>
      <button
        onClick={() => copy("code")}
        className="tap mt-1 flex items-center gap-2 font-display text-[30px] font-semibold tracking-wide text-gold"
      >
        {s.code}
        {copied === "code" ? <Check className="size-5 text-success" /> : <Copy className="size-5 opacity-60" />}
      </button>

      <p className="mt-4 text-[13px] font-medium text-muted">Your link</p>
      <p className="tnum mt-1 break-all rounded-xl bg-elevated px-3 py-2.5 text-[13px] text-primary">{s.link}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => copy("link")}
          className="tap flex h-11 items-center justify-center gap-2 rounded-xl bg-elevated text-[14px] font-semibold text-primary"
        >
          {copied === "link" ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
        <button
          onClick={share}
          className="cta flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold"
        >
          <Share2 className="size-4" />
          Share
        </button>
      </div>
      {s.referrer && <p className="mt-3 text-[12.5px] text-muted-2">You were referred by {s.referrer}.</p>}
    </section>
  );
}

function AddCode({ until: ends, onDone }: { until: number; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await r.json()) as { error?: string };
      if (r.ok) onDone();
      else setError(data.error ?? "That code could not be added.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Add a referral code" note={`until ${until(ends)}`} />
      <div className="surface p-5">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Joined through a friend? Enter their code in your first 24 hours and you both receive ITDB when you reach
          Tier 2.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 13))}
            placeholder="ITDB-XXXXXX"
            aria-label="Referral code"
            className="tnum inset min-w-0 flex-1 bg-transparent px-3.5 py-3 text-[16px] font-semibold tracking-wide text-primary outline-none"
          />
          <button
            onClick={submit}
            disabled={busy || code.length < 9}
            className="cta flex shrink-0 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold disabled:opacity-60"
          >
            <UserPlus className="size-4" />
            {busy ? "Checking…" : "Add"}
          </button>
        </div>
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      </div>
    </section>
  );
}

const TX = (hash: string) => `https://stellar.expert/explorer/public/tx/${hash}`;

const STATUS_STYLE: Record<RewardView["status"], string> = {
  paid: "bg-success-soft text-success",
  sending: "bg-gold-soft text-gold",
  queued: "bg-gold-soft text-gold",
  blocked: "bg-danger-soft text-danger",
  waiting: "bg-elevated text-muted-2",
};
const STATUS_LABEL: Record<RewardView["status"], string> = {
  paid: "Sent",
  sending: "Sending",
  queued: "Queued",
  blocked: "Action needed",
  waiting: "Not yet",
};

function Status({ r }: { r: RewardView }) {
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <span className={cn("rounded-md px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide", STATUS_STYLE[r.status])}>
        {STATUS_LABEL[r.status]}
      </span>
      {r.txHash && (
        <a href={TX(r.txHash)} target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-semibold text-gold">
          View transaction
        </a>
      )}
    </span>
  );
}

function MatchBonus({ s }: { s: ReferralSummary }) {
  const per = formatAmount(s.perReferral, 0);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Referral rewards" note={`${per} ITDB each`} />
      <div className="surface p-5">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Every referral who reaches Tier 2 and holds {per} ITDB for {s.holdDays} days earns{" "}
          <span className="font-semibold text-primary">{per} ITDB for you</span> and{" "}
          <span className="font-semibold text-primary">{per} ITDB for them</span>, sent straight to your wallets on the
          Stellar network.
        </p>

        {(s.received > 0 || s.owed > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-elevated px-3.5 py-3">
              <p className="text-[12px] text-muted">Received</p>
              <p className="tnum mt-0.5 text-[17px] font-semibold text-gold">{formatAmount(s.received, 0)} ITDB</p>
            </div>
            <div className="rounded-2xl bg-elevated px-3.5 py-3">
              <p className="text-[12px] text-muted">On its way</p>
              <p className="tnum mt-0.5 text-[17px] font-semibold text-primary">{formatAmount(s.owed, 0)} ITDB</p>
            </div>
          </div>
        )}

        {s.myReward && (
          <div className="mt-4 flex items-start justify-between gap-3 border-t border-hairline pt-4">
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold text-primary">Your welcome reward</p>
              <p className="text-[12.5px] text-muted">
                {s.myReward.status === "waiting"
                  ? `${per} ITDB once you have held ${per} ITDB for ${s.holdDays} days`
                  : s.myReward.note ?? `${per} ITDB for joining through ${s.referrer ?? "a referral"}`}
              </p>
            </div>
            <Status r={s.myReward} />
          </div>
        )}

        <p className="mt-4 text-[12.5px] leading-relaxed text-muted-2">
          Nobody approves these by hand. Your wallet needs an ITDB trustline to receive them — the same one it needs to
          hold ITDB at all.
        </p>
      </div>
    </section>
  );
}

function YourReferrals({ s }: { s: ReferralSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Your referrals"
        note={s.referees.length ? `${s.referees.filter((r) => r.qualifiedAt).length} of ${s.referees.length} qualified` : undefined}
      />
      {s.referees.length === 0 ? (
        <p className="surface p-5 text-[13.5px] text-muted">Nobody yet — share your link to start.</p>
      ) : (
        <div className="surface divide-y divide-hairline">
          {s.referees.map((r) => (
            <div key={r.username} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-primary">{r.username}</p>
                <p className="text-[12.5px] text-muted">
                  {r.qualifiedAt
                    ? `Tier 2 in ${r.tokens.join(", ")} · ${r.reward.status === "waiting" ? r.reward.note : `${formatAmount(r.reward.amount, 0)} ITDB for you`}`
                    : r.reward.note}
                  {r.reward.status === "blocked" && r.reward.note && ` · ${r.reward.note}`}
                </p>
              </div>
              <Status r={r.reward} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Leaderboard({ s }: { s: ReferralSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Top referrers"
        note={s.month.myRank ? `you're #${s.month.myRank}` : s.month.label}
      />
      <div className="surface p-5">
        <div className="flex flex-col gap-2.5">
          {s.prizes.map((p) => {
            const row = s.month.rows.find((r) => r.rank === p.place);
            return (
              <div key={p.place} className="flex items-start gap-3">
                <span className="text-[22px] leading-none">{p.medal}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-primary">
                    {row ? row.username : "Open"}
                    {row && (
                      <span className="ml-2 text-[12.5px] font-medium text-muted">
                        {row.qualified} qualified
                      </span>
                    )}
                  </p>
                  <p className="tnum text-[12.5px] text-muted">
                    {formatAmount(p.XDC, 0)} XDC · {formatAmount(p.XLM, 0)} XLM · {formatAmount(p.XRP, 0)} XRP
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {s.month.rows.length > 3 && (
          <div className="mt-4 border-t border-hairline pt-3">
            {s.month.rows.slice(3).map((r) => (
              <p key={r.accountId} className="tnum flex justify-between py-1 text-[13px] text-muted">
                <span>
                  #{r.rank} {r.username}
                </span>
                <span>{r.qualified}</span>
              </p>
            ))}
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-muted-2">
          <Trophy className="size-3.5" />
          {s.month.label} — ranked by referrals who reached Tier 2 this month.
        </p>
        {s.lastMonth.winners.length > 0 && (
          <p className="mt-1 text-[12.5px] text-muted-2">
            {s.lastMonth.label}: {s.lastMonth.winners.map((w) => `#${w.rank} ${w.username}`).join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}

function Rules({ s }: { s: ReferralSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="How it works" />
      <div className="surface p-5">
        <ol className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-primary">
          <li>1. Share your link or code.</li>
          <li>2. Your friend joins and connects their wallet — or adds your code in their first 24 hours.</li>
          <li>
            3. When they reach Tier 2 in any ITDB token and have held {formatAmount(s.perReferral, 0)} ITDB for{" "}
            {s.holdDays} days without a break, you both receive {formatAmount(s.perReferral, 0)} ITDB, sent to your
            wallets automatically.
          </li>
        </ol>
        <p className="label mt-4">Tier 2 starts at</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {s.tiers.map((t) => (
            <span key={t.token} className="tnum rounded-md bg-elevated px-2.5 py-1.5 text-[12.5px] text-primary">
              {formatAmount(t.tier2, 0)} {t.token}
            </span>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-muted-2">
          Self-referrals, accounts sharing a wallet with their referrer, referral rings and wallets already counted for
          someone else are disqualified automatically. The holding is checked on chain: ITDB moved out during the{" "}
          {s.holdDays} days restarts the clock.
        </p>
      </div>
    </section>
  );
}
