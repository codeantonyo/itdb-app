import { randomUUID } from "crypto";
import {
  AIRDROP_ASSETS,
  AIRDROP_BLURB,
  AIRDROP_ID,
  AIRDROP_REQUIRES,
  AIRDROP_TITLE,
  airdropAsset,
  type AirdropAsset,
} from "@/lib/itdb/airdrop";
import { ITDBONE_TOKEN, ITDB_TOKEN, QRS_TOKEN } from "@/lib/itdb/config";
import type { RegistryToken } from "@/lib/stellar/registry";
import { mutateDb, type AirdropRecord, type DbAccount } from "./db";
import { getFx, type FxRates, type PriceSource } from "./fx";
import { memberHoldings, tokenBalance } from "./holdings";
import { creditCard } from "./ledger";

/**
 * The airdrop engine.
 *
 * Eligibility is read from chain: a member must hold ALL THREE ITDB
 * assets across their linked wallets. That is checked against what they
 * hold and nothing else — never by subtracting one funding route from
 * another (§6.3) — and a Horizon failure raises instead of quietly
 * reading as "not eligible" (§6.4).
 *
 * Claiming locks the granted quantities into the member's record. Their
 * USD value floats with live prices afterwards, and withdrawing moves
 * value onto a card through the shared ledger, which refuses any credit
 * that would carry a zero XLM value (§6.1).
 */

const REQUIRED_TOKENS: Record<(typeof AIRDROP_REQUIRES)[number], RegistryToken> = {
  ITDB: ITDB_TOKEN,
  ITDBONE: ITDBONE_TOKEN,
  QRS: QRS_TOKEN,
};

/** USD per unit for one airdrop asset. null = no price available. */
function priceOf(asset: AirdropAsset, fx: FxRates): { usd: number | null; source: PriceSource | null } {
  // Pegged reserve assets ride the live XLM rate, but the peg itself is
  // simulated, so they are marked "reference" rather than "live".
  if (asset.xlmPeg != null) return { usd: asset.xlmPeg * fx.xlmUsd, source: "reference" };
  if (asset.kind === "metal" && asset.metal) {
    return { usd: fx.metalUsdPerOz(asset.metal), source: fx.metalSourceOf(asset.metal) };
  }
  return { usd: fx.usdOf(asset.code), source: fx.sourceOf(asset.code) };
}

export interface AirdropLineView {
  code: string;
  name: string;
  kind: AirdropAsset["kind"];
  unit: string;
  granted: number;
  remaining: number;
  /** null when the asset has no public market */
  usdPerUnit: number | null;
  valueUsd: number | null;
  source: PriceSource | null;
}

export interface RequirementView {
  code: string;
  held: number;
  ok: boolean;
}

export interface AirdropSummary {
  airdropId: string;
  title: string;
  blurb: string;
  /** Holds all three required assets right now */
  eligible: boolean;
  requirements: RequirementView[];
  claimed: boolean;
  claimedAt: number | null;
  lines: AirdropLineView[];
  /** Value of everything still held, priced lines only */
  remainingUsd: number;
  /** Value of the full grant at today's prices */
  grantUsd: number;
  withdrawnUsd: number;
  withdrawals: AirdropRecord["withdrawals"];
  /** Codes with no public market, shown but not withdrawable */
  unpriced: string[];
}

/** Build the member's view: the reward table, priced live. */
export function airdropView(record: AirdropRecord | undefined, requirements: RequirementView[], fx: FxRates): AirdropSummary {
  const lines: AirdropLineView[] = AIRDROP_ASSETS.map((asset) => {
    const held = record?.lines.find((l) => l.code === asset.code);
    const granted = held?.granted ?? asset.amount;
    const remaining = held?.remaining ?? asset.amount;
    const { usd, source } = priceOf(asset, fx);
    return {
      code: asset.code,
      name: asset.name,
      kind: asset.kind,
      unit: asset.unit,
      granted,
      remaining,
      usdPerUnit: usd,
      valueUsd: usd === null ? null : remaining * usd,
      source,
    };
  });

  return {
    airdropId: AIRDROP_ID,
    title: AIRDROP_TITLE,
    blurb: AIRDROP_BLURB,
    eligible: requirements.every((r) => r.ok),
    requirements,
    claimed: !!record,
    claimedAt: record?.claimedAt ?? null,
    lines,
    remainingUsd: lines.reduce((s, l) => s + (l.valueUsd ?? 0), 0),
    grantUsd: lines.reduce((s, l) => s + (l.usdPerUnit === null ? 0 : l.granted * l.usdPerUnit), 0),
    withdrawnUsd: record?.withdrawnUsd ?? 0,
    withdrawals: record?.withdrawals ?? [],
    unpriced: lines.filter((l) => l.usdPerUnit === null).map((l) => l.code),
  };
}

/** What the member holds of each required asset, straight from chain. */
export async function airdropRequirements(wallets: string[]): Promise<RequirementView[]> {
  const holdings = await memberHoldings(wallets);
  return AIRDROP_REQUIRES.map((code) => {
    const held = tokenBalance(holdings, REQUIRED_TOKENS[code]);
    return { code, held, ok: held > 0 };
  });
}

export type ClaimResult =
  | { ok: true; grantUsd: number; lines: number }
  | { ok: false; error: string; status: number };

/**
 * Claim the airdrop. Eligibility is re-read from chain inside the call,
 * so a stale client can never claim on a holding the member no longer
 * has, and the write is idempotent: a second claim is refused.
 */
export async function claimAirdrop(account: DbAccount): Promise<ClaimResult> {
  let requirements: RequirementView[];
  let fx: FxRates;
  try {
    [requirements, fx] = await Promise.all([airdropRequirements(account.wallets), getFx()]);
  } catch {
    return {
      ok: false,
      error: "The Stellar network is busy — your eligibility is safe, try again shortly.",
      status: 503,
    };
  }

  const missing = requirements.filter((r) => !r.ok).map((r) => r.code);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `This airdrop is for members holding all three ITDB assets. You are missing ${missing.join(", ")}.`,
      status: 403,
    };
  }

  return mutateDb((db) => {
    if (db.airdrops[account.id]) {
      return { ok: false as const, error: "You have already claimed this airdrop.", status: 409 };
    }
    const record: AirdropRecord = {
      airdropId: AIRDROP_ID,
      claimedAt: Date.now(),
      lines: AIRDROP_ASSETS.map((a) => ({ code: a.code, granted: a.amount, remaining: a.amount })),
      withdrawals: [],
      withdrawnUsd: 0,
    };
    db.airdrops[account.id] = record;
    const view = airdropView(record, requirements, fx);
    return { ok: true as const, grantUsd: view.grantUsd, lines: record.lines.length };
  });
}

export type WithdrawResult =
  | { ok: true; code: string; units: number; usd: number; credited: number; currency: string }
  | { ok: false; error: string; status: number };

/**
 * Move airdropped value onto a card. The amount is recomputed inside
 * the mutation from the stored grant, so a tampered client figure can
 * never be banked, and the quantity is deducted in the same write.
 */
export async function withdrawAirdrop(
  account: DbAccount,
  code: string,
  units: number,
  cardId: string,
): Promise<WithdrawResult> {
  const asset = airdropAsset(code);
  if (!asset) return { ok: false, error: "Unknown asset.", status: 400 };
  if (!Number.isFinite(units) || units <= 0) {
    return { ok: false, error: "Enter an amount to withdraw.", status: 400 };
  }

  let fx: FxRates;
  try {
    fx = await getFx();
  } catch {
    return { ok: false, error: "Rates are unavailable — try again shortly.", status: 503 };
  }

  const { usd: usdPerUnit } = priceOf(asset, fx);
  if (usdPerUnit === null || !(usdPerUnit > 0)) {
    return { ok: false, error: "No price available for that asset right now.", status: 503 };
  }

  return mutateDb((db) => {
    const record = db.airdrops[account.id];
    if (!record) return { ok: false as const, error: "You have not claimed this airdrop.", status: 404 };

    const line = record.lines.find((l) => l.code === code);
    if (!line) return { ok: false as const, error: "That asset is not part of your grant.", status: 404 };
    if (units > line.remaining + 1e-9) {
      return {
        ok: false as const,
        error: `You only hold ${line.remaining.toLocaleString("en-US")} ${asset.unit} of ${asset.name}.`,
        status: 409,
      };
    }

    const usd = units * usdPerUnit;
    const credit = creditCard(db, account.id, cardId, usd, "USD", "airdrop", fx);
    if ("error" in credit) return { ok: false as const, error: credit.error, status: 404 };

    line.remaining = Math.max(0, line.remaining - units);
    record.withdrawnUsd = Math.round((record.withdrawnUsd + usd) * 100) / 100;
    record.withdrawals.push({
      id: randomUUID(),
      at: Date.now(),
      code,
      units,
      usd,
      destination: cardId,
      credited: credit.credited,
      currency: credit.currency,
    });
    if (record.withdrawals.length > 200) record.withdrawals = record.withdrawals.slice(-200);

    return {
      ok: true as const,
      code,
      units,
      usd,
      credited: credit.credited,
      currency: credit.currency,
    };
  });
}

export { AIRDROP_TITLE, AIRDROP_BLURB };
