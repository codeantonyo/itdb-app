import { NextResponse } from "next/server";
import { airdropRequirements, airdropView, type AirdropSummary } from "@/lib/server/airdrop";
import { getDb } from "@/lib/server/db";
import { getFx } from "@/lib/server/fx";
import { sessionAccountId } from "@/lib/server/session";

export type { AirdropSummary };

/** GET /api/airdrop — eligibility, the reward table priced live, and any claim. */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  try {
    const [requirements, fx] = await Promise.all([airdropRequirements(account.wallets), getFx()]);
    return NextResponse.json(airdropView(db.airdrops[id], requirements, fx));
  } catch {
    // Unknown is not "ineligible" (§6.4).
    return NextResponse.json(
      { error: "The Stellar network is busy — your eligibility is safe, try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
}
