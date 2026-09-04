import { NextResponse } from "next/server";
import { HORIZON } from "@/lib/stellar/horizon";
import { horizonJson } from "@/lib/stellar/horizon-fetch";
import type {
  AccountBalance,
  AccountPayment,
  AccountResponse,
} from "@/lib/stellar/types";

const ADDRESS_RE = /^G[A-Z2-7]{55}$/;

interface HorizonBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

interface HorizonPayment {
  id: string;
  type: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  starting_balance?: string;
  account?: string;
  funder?: string;
  created_at: string;
}

function mapPayment(record: HorizonPayment, self: string): AccountPayment {
  if (record.type === "create_account") {
    return {
      id: record.id,
      direction: record.account === self ? "received" : "sent",
      kind: "create_account",
      code: "XLM",
      amount: parseFloat(record.starting_balance ?? "0"),
      counterparty: record.funder ?? null,
      at: record.created_at,
    };
  }
  const received = record.to === self;
  return {
    id: record.id,
    direction: received ? "received" : record.from === self ? "sent" : "other",
    kind: record.type,
    code: record.asset_type === "native" ? "XLM" : (record.asset_code ?? "XLM"),
    amount: parseFloat(record.amount ?? "0"),
    counterparty: (received ? record.from : record.to) ?? null,
    at: record.created_at,
  };
}

/**
 * GET /api/account/[address]
 * Live balances + recent payments for a Stellar account from Horizon.
 *
 * A rate-limited Horizon is a 503, never an empty account (§6.4).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Invalid Stellar address" }, { status: 400 });
  }

  const accountRes = await horizonJson<{ balances: HorizonBalance[] }>(
    `${HORIZON}/accounts/${address}`,
    { next: { revalidate: 15 } },
  );

  if (accountRes.kind === "absent") {
    const body: AccountResponse = { exists: false, id: address, balances: [], payments: [] };
    return NextResponse.json(body);
  }
  if (accountRes.kind === "unavailable") {
    return NextResponse.json(
      { error: "The Stellar network is busy — try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  const balances: AccountBalance[] = accountRes.data.balances
    .filter((b) => b.asset_type === "native" || b.asset_code)
    .map((b) => ({
      code: b.asset_type === "native" ? "XLM" : b.asset_code!,
      issuer: b.asset_type === "native" ? null : (b.asset_issuer ?? null),
      balance: parseFloat(b.balance),
    }));

  let payments: AccountPayment[] = [];
  const payRes = await horizonJson<{ _embedded?: { records?: HorizonPayment[] } }>(
    `${HORIZON}/accounts/${address}/payments?order=desc&limit=25`,
    { next: { revalidate: 15 } },
  );
  if (payRes.kind === "found") {
    payments = (payRes.data._embedded?.records ?? [])
      .map((r) => mapPayment(r, address))
      .filter((p) => p.amount > 0);
  }
  // payments are non-critical; balances still render when they're unavailable

  const body: AccountResponse = { exists: true, id: address, balances, payments };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
  });
}
