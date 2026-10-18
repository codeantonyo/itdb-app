"use client";

import { useState } from "react";
import { Check, Copy, Lock, Share2, Trophy, UserPlus } from "lucide-react";
import type { ReferralSummary, RewardView } from "@/app/api/referral/route";
import { AppBar } from "@/components/layout/app-bar";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/client/use-json";
import { formatAmount } from "@/lib/format";
import {
  BUY_TOKENS,
  BUY_USDC,
  BUY_XLM,
  GIVEAWAY,
  ICO_CODES,
  JOIN_TOKENS,
  LADDER,
  VERIFICATION_RULES,
} from "@/lib/itdb/referral-program";
import { cn } from "@/lib/utils";

const fmt = (n: number) => formatAmount(n, 0);
const until = (t: number) =>
  new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ICO_LIST = ICO_CODES.join(" · ");

export default function ReferralPage() {
  const ref = useJson<ReferralSummary>("/api/referral", 30_000);
  const s = ref.data;

  return (
    <div className="flex flex-col gap-5">
      <AppBar back title="Referrals" subtitle="Invite. Get paid." />

      <Giveaway s={s} />

      {ref.error && !s && <NetworkNotice message={ref.error} onRetry={ref.refresh} />}
      {!s && !ref.error && <Skeleton className="h-[220px] rounded-[20px]" />}

      {s && (
        <>
          <ShareCard s={s} />
          {s.addCodeUntil !== null && <AddCode until={s.addCodeUntil} onDone={ref.refresh} />}
        </>
      )}
      <Rewards />
      {s && <YourRewards s={s} onPicked={ref.refresh} />}
      <Ladder s={s} />
      {s && <YourReferrals s={s} />}
      {s && <Leaderboard s={s} />}
      <Rules />
      {s?.legacy && <Earlier legacy={s.legacy} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Giveaway({ s }: { s?: ReferralSummary | null }) {
  const left = Math.max(GIVEAWAY.minimum - (s?.giveaway.mine ?? 0), 0);
  return (
    <section className="panel-navy engrave overflow-hidden p-5">
      <p className="font-display text-[22px] font-semibold leading-tight text-gold">🔥 {GIVEAWAY.title}</p>
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {GIVEAWAY.prizes.map((p) => {
          const row = s?.giveaway.rows.find((r) => r.rank === p.place);
          return (
            <div key={p.place} className="flex items-center gap-3 rounded-xl bg-elevated px-3 py-2">
              <span className="text-[19px] leading-none">{p.medal}</span>
              <span className="tnum font-display text-[17px] font-semibold text-primary">${p.usd.toLocaleString("en-US")}</span>
              <span className="ml-auto truncate text-[12.5px] text-muted">
                {row ? `${row.username} · ${row.count}${row.count < GIVEAWAY.minimum ? " (needs 10)" : ""}` : "Open"}
              </span>
            </div>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-col gap-1 text-[13px] leading-relaxed text-primary">
        {GIVEAWAY.rules.map((r) => (
          <li key={r}>📌 {r}</li>
        ))}
      </ul>
      {s && (
        <p className="tnum mt-3 rounded-xl bg-gold-soft px-3.5 py-2.5 text-[13px] font-semibold text-gold">
          You: {s.giveaway.mine} new member{s.giveaway.mine === 1 ? "" : "s"} this month
          {left > 0 ? ` — ${left} more to enter` : s.giveaway.myRank ? ` — you are #${s.giveaway.myRank}` : ""}
        </p>
      )}
    </section>
  );
}

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
          Joined through a friend? Enter their code in your first 24 hours and you both get {JOIN_TOKENS} tokens now.
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

function Rewards() {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Your rewards" note="both of you" />
      <div className="surface p-5">
        <p className="font-display text-[22px] font-semibold leading-tight text-primary">
          💵 {fmt(BUY_USDC)} for you. 💵 {fmt(BUY_USDC)} for your friend.
        </p>

        <div className="mt-4 rounded-2xl bg-elevated p-4">
          <p className="text-[12px] font-bold uppercase tracking-wide text-gold">1 · Join</p>
          <p className="mt-1 text-[14px] leading-relaxed text-primary">
            Your friend joins the channel and creates an account → you both get{" "}
            <b>{fmt(JOIN_TOKENS)} tokens</b>, instantly.
          </p>
          <p className="mt-1 text-[12.5px] text-muted">Each of you chooses the ICO: {ICO_LIST}</p>
        </div>

        <div className="mt-2 rounded-2xl bg-elevated p-4">
          <p className="text-[12px] font-bold uppercase tracking-wide text-gold">2 · Buy</p>
          <p className="mt-1 text-[14px] leading-relaxed text-primary">
            Your friend buys {BUY_XLM} XLM → you both get{" "}
            <b>
              {fmt(BUY_USDC)} USDC + {fmt(BUY_TOKENS)} tokens
            </b>
            .
          </p>
          <p className="mt-1 text-[12.5px] text-muted">Tokens from the same five ICOs, your choice.</p>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-gold">
          <Lock className="size-3.5" />
          Credited instantly. Unlocked at the flip.
        </p>
      </div>
    </section>
  );
}

/** What I have been credited, with the ICO picker for any tokens not yet assigned. */
function YourRewards({ s, onPicked }: { s: ReferralSummary; onPicked: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (s.credits.length === 0) return null;

  const pick = async (key: string, token: string) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pick: key, token }),
      });
      const data = (await r.json()) as { error?: string };
      if (r.ok) onPicked();
      else setError(data.error ?? "That did not work.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const tokens = Object.entries(s.totals.tokens);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Credited to you" note="🔒 unlocked at the flip" />
      <div className="surface p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-elevated px-3.5 py-3">
            <p className="text-[12px] text-muted">USDC</p>
            <p className="tnum mt-0.5 text-[18px] font-semibold text-gold">{fmt(s.totals.usdc)}</p>
          </div>
          <div className="rounded-2xl bg-elevated px-3.5 py-3">
            <p className="text-[12px] text-muted">Tokens</p>
            <p className="tnum mt-0.5 text-[13.5px] font-semibold leading-snug text-primary">
              {tokens.length ? tokens.map(([c, n]) => `${fmt(n)} ${c}`).join(" · ") : "—"}
              {s.totals.unpicked > 0 && <span className="block text-gold">{fmt(s.totals.unpicked)} to choose</span>}
            </p>
          </div>
        </div>

        <div className="mt-4 divide-y divide-hairline border-t border-hairline">
          {s.credits.map((c) => (
            <div key={c.key} className="py-3">
              <p className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="font-semibold text-primary">
                  {c.kind === "join" ? "Join" : c.kind === "buy" ? `Bought ${BUY_XLM} XLM` : "Ladder"}
                  <span className="ml-1.5 font-normal text-muted">· {c.about}</span>
                </span>
                <span className="tnum shrink-0 text-[13px] text-primary">
                  {[c.usdc ? `${fmt(c.usdc)} USDC` : "", c.tokens ? `${fmt(c.tokens)} ${c.token ?? "tokens"}` : ""]
                    .filter(Boolean)
                    .join(" + ")}
                </span>
              </p>
              {c.tokens > 0 && !c.token && (
                <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
                  {ICO_CODES.map((code) => (
                    <button
                      key={code}
                      disabled={busy !== null}
                      onClick={() => pick(c.key, code)}
                      className="tap shrink-0 rounded-full bg-gold-soft px-3 py-1.5 text-[12px] font-bold text-gold disabled:opacity-50"
                    >
                      {busy === c.key ? "…" : code}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      </div>
    </section>
  );
}

function Ladder({ s }: { s?: ReferralSummary | null }) {
  const q = s?.qualified ?? 0;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="And if you keep going" note={s?.next ? `${q}/${s.next.friends} friends` : s ? "top step" : undefined} />
      <div className="surface divide-y divide-hairline">
        {LADDER.map((step) => {
          const done = q >= step.friends;
          const pct = Math.min(q / step.friends, 1) * 100;
          return (
            <div key={step.friends} className="px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14.5px] font-semibold text-primary">👥 {step.friends} friends</p>
                <p className={cn("tnum text-[12.5px] font-semibold", done ? "text-success" : "text-muted")}>
                  {done ? "Reached ✓" : `${Math.min(q, step.friends)}/${step.friends} friends`}
                </p>
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                {fmt(step.usdc)} USDC + {step.atms} ATM{step.atms > 1 ? "s" : ""} + {step.vaults} VAULT
                {step.vaults > 1 ? "S" : ""}
                {step.extras.map((x) => ` + ${x}`).join("")}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="px-1 text-[12.5px] text-muted-2">
        A friend counts once they buy {BUY_XLM} XLM. Each step replaces the one before; the ATMs and vaults are added to
        what you can place.
      </p>
    </section>
  );
}

function YourReferrals({ s }: { s: ReferralSummary }) {
  const toGiveaway = Math.max(GIVEAWAY.minimum - s.giveaway.mine, 0);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Your referrals" />
      <div className="surface p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-elevated px-3.5 py-3">
            <p className="text-[12px] text-muted">Brought</p>
            <p className="tnum mt-0.5 font-display text-[26px] font-semibold leading-none text-primary">{s.brought}</p>
          </div>
          <div className="rounded-2xl bg-elevated px-3.5 py-3">
            <p className="text-[12px] text-muted">Bought {BUY_XLM} XLM</p>
            <p className="tnum mt-0.5 font-display text-[26px] font-semibold leading-none text-gold">{s.qualified}</p>
          </div>
        </div>
        <div className="tnum mt-3 flex gap-1.5 text-[12.5px]">
          {LADDER.map((st) => (
            <span
              key={st.friends}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-center font-semibold",
                s.qualified >= st.friends ? "bg-success-soft text-success" : "bg-elevated text-muted",
              )}
            >
              {Math.min(s.qualified, st.friends)}/{st.friends}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-primary">
          {toGiveaway > 0
            ? `${toGiveaway} more new member${toGiveaway === 1 ? "" : "s"} this month to enter the giveaway.`
            : "You are in the giveaway — keep going for a higher place."}
        </p>

        {s.friends.length > 0 && (
          <div className="mt-4 divide-y divide-hairline border-t border-hairline">
            {s.friends.map((f) => (
              <div key={`${f.username}-${f.joinedAt}`} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-primary">{f.username}</span>
                  <span className="block text-[12px] text-muted">
                    Joined {new Date(f.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {!f.counted && " · over the daily limit, not counted"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide",
                    f.boughtAt ? "bg-success-soft text-success" : "bg-elevated text-muted-2",
                  )}
                >
                  {f.boughtAt ? `${BUY_XLM} XLM ✓` : "Joined"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Leaderboard({ s }: { s: ReferralSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Top referrers" note={s.month.myRank ? `you're #${s.month.myRank}` : s.month.label} />
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
                    {row && <span className="ml-2 text-[12.5px] font-medium text-muted">{row.count} invested</span>}
                  </p>
                  <p className="tnum text-[12.5px] text-muted">
                    {fmt(p.XDC)} XDC · {fmt(p.XLM)} XLM · {fmt(p.XRP)} XRP
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
                <span>{r.count}</span>
              </p>
            ))}
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-muted-2">
          <Trophy className="size-3.5" />
          Ranked by new members who invested {BUY_XLM}+ XLM this month.
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

function Rules() {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="The rules" note="we verify every one" />
      <div className="surface p-5">
        <ul className="flex flex-col gap-1.5 text-[13.5px] leading-relaxed text-primary">
          {VERIFICATION_RULES.map((r) => (
            <li key={r}>🔥 {r}</li>
          ))}
          <li>🔥 Buys {BUY_XLM} XLM to unlock the big reward</li>
        </ul>
      </div>
    </section>
  );
}

const STATUS_LABEL: Record<RewardView["status"], string> = {
  paid: "Sent",
  sending: "Sending",
  queued: "Queued",
  blocked: "Action needed",
  waiting: "Not yet",
};

/** The earlier on-chain program, for those it has paid or still owes. */
function Earlier({ legacy }: { legacy: NonNullable<ReferralSummary["legacy"]> }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Earlier referral rewards" note="10,000 ITDB each" />
      <div className="surface divide-y divide-hairline px-4">
        {legacy.rows.map((r, i) => (
          <div key={`${r.who}-${i}`} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1 truncate text-[14px] text-primary">{r.who}</span>
            {r.txHash ? (
              <a
                href={`https://stellar.expert/explorer/public/tx/${r.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-bold text-success"
              >
                Sent ✓
              </a>
            ) : (
              <span className="text-[12px] font-semibold text-gold">{STATUS_LABEL[r.status]}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
