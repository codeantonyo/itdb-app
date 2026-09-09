import {
  PRESALE_REFUND_PCT,
  presaleRefundXlm,
  presaleTotals,
  type PresaleTotals,
} from "@/lib/itdb/presale";
import { mutateDb, type DbAccount, type PresaleRefundRecord } from "./db";
import { getFx, type FxRates } from "./fx";
import { creditCard } from "./ledger";

/**
 * QRS pre-sale early-bird bonuses.
 *
 * BOTH ARE SIMULATED. The 20% refund credits a card in the app's own
 * ledger; no XLM leaves any wallet. The x2 QRS drop is shown as an
 * entitlement — this module never signs or submits a Stellar payment,
 * and holds no issuer key.
 *
 * Eligibility comes only from the allowlist in lib/itdb/presale.ts. A
 * member whose wallets are absent from it gets `null` here, and the UI
 * shows them nothing (§ "For wallets not in the CSV, do not show these
 * bonuses").
 */

export interface PresaleBonusView {
  /** The member's allowlisted wallets */
  wallets: string[];
  refundPct: number;
  /** Pre-sale spend the refund is calculated from */
  xlmSpent: number;
  /** 20% of that, in XLM */
  refundXlm: number;
  /** Its value today, for the card credit */
  refundUsd: number;
  /** QRS bought in the pre-sale */
  qrsPurchased: number;
  /** The x2 drop pays that much again */
  bonusQrs: number;
  /** Set once the refund has been paid onto a card */
  paid: PresaleRefundRecord | null;
}

/** The member's bonuses, or null when they did not buy in the pre-sale. */
export function presaleView(
  account: DbAccount,
  record: PresaleRefundRecord | undefined,
  fx: FxRates,
): PresaleBonusView | null {
  const totals = presaleTotals(account.wallets);
  if (!totals) return null;
  return viewFrom(totals, record, fx);
}

function viewFrom(
  totals: PresaleTotals,
  record: PresaleRefundRecord | undefined,
  fx: FxRates,
): PresaleBonusView {
  const refundXlm = presaleRefundXlm(totals);
  return {
    wallets: totals.wallets,
    refundPct: PRESALE_REFUND_PCT,
    xlmSpent: totals.xlmSpent,
    refundXlm,
    refundUsd: refundXlm * fx.usdOf("XLM"),
    qrsPurchased: totals.qrsPurchased,
    // "Send that exact amount again as a bonus (x2 drop)."
    bonusQrs: totals.qrsPurchased,
    paid: record ?? null,
  };
}

export type RefundResult =
  | { ok: true; xlm: number; usd: number; credited: number; currency: string }
  | { ok: false; error: string; status: number };

/**
 * Pay the 20% refund onto one of the member's cards, once.
 *
 * The amount is recomputed from the allowlist inside the mutation, so a
 * stale client figure can never be banked, and the record is written in
 * the same write as the credit — a refund can never be paid twice.
 */
export async function payPresaleRefund(
  account: DbAccount,
  destination: string,
): Promise<RefundResult> {
  const totals = presaleTotals(account.wallets);
  if (!totals) {
    return {
      ok: false,
      error: "This account holds no wallet from the pre-sale list.",
      status: 403,
    };
  }

  let fx: FxRates;
  try {
    fx = await getFx();
  } catch {
    return {
      ok: false,
      error: "Live rates are unavailable — your refund is safe, try again shortly.",
      status: 503,
    };
  }

  return mutateDb((db) => {
    if (db.presaleRefunds[account.id]) {
      return {
        ok: false as const,
        error: "Your pre-sale refund has already been paid.",
        status: 409,
      };
    }

    const view = viewFrom(totals, undefined, fx);
    if (!(view.refundUsd > 0)) {
      return {
        ok: false as const,
        error: "This refund works out to nothing at today's rates.",
        status: 409,
      };
    }

    const credit = creditCard(db, account.id, destination, view.refundXlm, "XLM", "presale", fx);
    if ("error" in credit) {
      return { ok: false as const, error: credit.error, status: 404 };
    }

    db.presaleRefunds[account.id] = {
      paidAt: Date.now(),
      wallets: view.wallets,
      xlm: view.refundXlm,
      usd: view.refundUsd,
      destination,
      credited: credit.credited,
      currency: credit.currency,
    };

    return {
      ok: true as const,
      xlm: view.refundXlm,
      usd: view.refundUsd,
      credited: credit.credited,
      currency: credit.currency,
    };
  });
}
