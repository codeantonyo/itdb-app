import { randomUUID } from "crypto";
import {
  COLLECT_COOLDOWN_MS,
  DAY_MS,
  ITDBONE_TIERS,
  ITDBONE_TOKEN,
  MIN_COLLECT_USD,
  QRS_TIERS,
  QRS_TOKEN,
  itdboneTierFor,
  qrsTierFor,
} from "@/lib/itdb/config";
import { firstAcquired } from "@/lib/stellar/acquired";
import type { RegistryToken } from "@/lib/stellar/registry";
import { mutateDb, type DbAccount, type YieldRecord } from "./db";
import { getFx, type FxRates, type PriceSource } from "./fx";
import { memberHoldings, tokenBalance, walletsHolding } from "./holdings";
import { creditAccount, creditCard, type CreditSource } from "./ledger";

/**
 * THE accrual helper — the one place daily yield is computed for both
 * ITDBONE and QRS, and the one place the accrual anchor moves.
 *
 * ENGINEERING WARNING (§6.2): `collectedAt` is only ever written inside
 * `collectYield`. Reading a member's yield, creating their record, or
 * anything else must never stamp the clock — that is what silently
 * wiped 266 NEWPAY members' uncollected salary.
 *
 * Yield runs from the LATER of first acquisition and the last collect,
 * so nothing is ever paid twice, and a brand-new record (collectedAt 0)
 * accrues from the day the member first held the token.
 */

export type Program = "itdbone" | "qrs";

interface ProgramDef {
  token: RegistryToken;
  source: CreditSource;
  /** Tier number + the daily lines it pays, or null below Tier 1 */
  ladder: (balance: number) => { tier: number; lines: { code: string; perDay: number }[] } | null;
  minLabel: string;
}

const PROGRAMS: Record<Program, ProgramDef> = {
  itdbone: {
    token: ITDBONE_TOKEN,
    source: "itdbone",
    ladder: (balance) => {
      const t = itdboneTierFor(balance);
      if (!t) return null;
      return {
        tier: t.tier,
        lines: [
          { code: "USD", perDay: t.dailyUsd },
          { code: "XLM", perDay: t.dailyXlm },
          { code: "XRP", perDay: t.dailyXrp },
          { code: "XDC", perDay: t.dailyXdc },
        ],
      };
    },
    minLabel: `${ITDBONE_TIERS[0].min.toLocaleString("en-US")} ITDBONE`,
  },
  qrs: {
    token: QRS_TOKEN,
    source: "qrs",
    ladder: (balance) => {
      const t = qrsTierFor(balance);
      if (!t) return null;
      return {
        tier: t.tier,
        lines: [
          { code: "USD", perDay: t.dailyUsd },
          ...Object.entries(t.daily).map(([code, perDay]) => ({ code, perDay })),
        ],
      };
    },
    minLabel: `${QRS_TIERS[0].min.toLocaleString("en-US")} QRS`,
  },
};

export interface YieldLine {
  code: string;
  perDay: number;
  /** Units accrued since the anchor */
  accrued: number;
  usdPerUnit: number;
  usd: number;
  source: PriceSource;
}

export interface YieldComputed {
  program: Program;
  balance: number;
  tier: number | null;
  /** First time the member held the token (null = not held / unknown) */
  since: number | null;
  /** The accrual anchor actually used: max(since, collectedAt) */
  from: number;
  daysAccrued: number;
  lines: YieldLine[];
  perDayUsd: number;
  yearlyUsd: number;
  pendingUsd: number;
  collectedUsd: number;
  lastCollectedAt: number;
  cooldownRemainingMs: number;
  minCollectUsd: number;
}

/**
 * Pure accrual — separated from IO so the maths is unit-testable.
 * Never mutates `record`.
 */
export function computeYield(
  program: Program,
  balance: number,
  since: number | null,
  record: YieldRecord | undefined,
  fx: FxRates,
  now = Date.now(),
): YieldComputed {
  const def = PROGRAMS[program];
  const ladder = def.ladder(balance);
  const lastCollectedAt = record?.collectedAt ?? 0;
  const from = Math.max(since ?? 0, lastCollectedAt);
  const daysAccrued = ladder && from > 0 ? Math.max(0, (now - from) / DAY_MS) : 0;

  const lines: YieldLine[] = (ladder?.lines ?? []).map((l) => {
    const usdPerUnit = fx.usdOf(l.code);
    const accrued = l.perDay * daysAccrued;
    return {
      code: l.code,
      perDay: l.perDay,
      accrued,
      usdPerUnit,
      usd: accrued * usdPerUnit,
      source: fx.sourceOf(l.code),
    };
  });
  const perDayUsd = lines.reduce((s, l) => s + l.perDay * l.usdPerUnit, 0);
  const pendingUsd = Math.floor(lines.reduce((s, l) => s + l.usd, 0) * 100) / 100;
  const sinceLast = now - lastCollectedAt;
  const cooldownRemainingMs =
    lastCollectedAt > 0 && sinceLast < COLLECT_COOLDOWN_MS
      ? COLLECT_COOLDOWN_MS - sinceLast
      : 0;

  return {
    program,
    balance,
    tier: ladder?.tier ?? null,
    since,
    from,
    daysAccrued: Math.floor(daysAccrued * 100) / 100,
    lines,
    perDayUsd,
    yearlyUsd: perDayUsd * 365,
    pendingUsd,
    collectedUsd: record?.collectedUsd ?? 0,
    lastCollectedAt,
    cooldownRemainingMs,
    minCollectUsd: MIN_COLLECT_USD,
  };
}

/** Live inputs for a member: balance + first-acquired across wallets. */
export async function programInputs(
  program: Program,
  wallets: string[],
): Promise<{ balance: number; since: number | null }> {
  const def = PROGRAMS[program];
  const holdings = await memberHoldings(wallets);
  const balance = tokenBalance(holdings, def.token);
  const holders = walletsHolding(holdings, def.token);
  // Wallets busy enough to bury the acquisition would otherwise read as
  // "never acquired" and earn nothing, so a wallet that demonstrably
  // holds the token always gets a start date (holding: true).
  const times = (
    await Promise.all(
      holders.map((w) =>
        firstAcquired(w, def.token.code, def.token.issuer, { holding: true }),
      ),
    )
  ).filter((t): t is number => t !== null);
  return { balance, since: times.length > 0 ? Math.min(...times) : null };
}

export type CollectResult =
  | {
      ok: true;
      usd: number;
      tier: number;
      credited: number;
      currency: string;
      lines: { code: string; units: number; usd: number }[];
    }
  | { ok: false; error: string; status: number };

/**
 * Collect the pending yield. The amount is recomputed inside the
 * mutation from the caller's live balance, so a stale client figure can
 * never be banked, and the anchor moves so it cannot be paid twice.
 *
 * This is the ONLY function that writes `collectedAt`.
 */
export async function collectYield(
  program: Program,
  account: DbAccount,
  destination: string,
): Promise<CollectResult> {
  const def = PROGRAMS[program];
  let inputs: { balance: number; since: number | null };
  let fx: FxRates;
  try {
    [inputs, fx] = await Promise.all([programInputs(program, account.wallets), getFx()]);
  } catch {
    return {
      ok: false,
      error: "The Stellar network is busy — your figures are safe, try again shortly.",
      status: 503,
    };
  }

  return mutateDb((db) => {
    const table = db[program];
    // A fresh record starts at collectedAt 0 — NEVER now (§6.2).
    const rec = (table[account.id] ??= { collectedAt: 0, collectedUsd: 0, claims: [] });
    const computed = computeYield(program, inputs.balance, inputs.since, rec, fx);
    if (!computed.tier) {
      return {
        ok: false as const,
        error: `Hold at least ${def.minLabel} to earn daily yield.`,
        status: 403,
      };
    }
    if (computed.pendingUsd < MIN_COLLECT_USD) {
      return {
        ok: false as const,
        error: `You need at least $${MIN_COLLECT_USD} of yield to collect — it keeps building.`,
        status: 409,
      };
    }
    if (computed.cooldownRemainingMs > 0) {
      const mins = Math.ceil(computed.cooldownRemainingMs / 60_000);
      return {
        ok: false as const,
        error: `Just collected — you can collect again in ${mins} min. Yield keeps accruing meanwhile.`,
        status: 409,
      };
    }

    const usd = computed.pendingUsd;
    const lines = computed.lines.map((l) => ({
      code: l.code,
      units: Math.floor(l.accrued * 1e7) / 1e7,
      usd: Math.floor(l.usd * 100) / 100,
    }));

    let credited = usd;
    let currency = "USD";
    if (destination !== "account") {
      const credit = creditCard(db, account.id, destination, usd, "USD", def.source, fx);
      if ("error" in credit) return { ok: false as const, error: credit.error, status: 404 };
      credited = credit.credited;
      currency = credit.currency;
    } else {
      creditAccount(db, account.id, usd, "USD", def.source, fx);
    }

    const now = Date.now();
    rec.collectedUsd = Math.round((rec.collectedUsd + usd) * 100) / 100;
    rec.collectedAt = now; // ← the one and only anchor move
    rec.claims.push({
      id: randomUUID(),
      at: now,
      usd,
      tier: computed.tier,
      destination,
      lines,
    });
    if (rec.claims.length > 200) rec.claims = rec.claims.slice(-200);

    return { ok: true as const, usd, tier: computed.tier, credited, currency, lines };
  });
}
