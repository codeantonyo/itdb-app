import { NextResponse } from "next/server";
import { fetchXlmUsd, resolveToken } from "@/lib/stellar/horizon";
import { TOKEN_REGISTRY } from "@/lib/stellar/registry";
import type { TokensResponse } from "@/lib/stellar/types";

export const revalidate = 60;

/**
 * GET /api/tokens
 * Registry token metadata (SEP-1 toml), live DEX prices and 7d history,
 * plus XLM/USD. Single round-trip for the whole client.
 *
 * If any token failed to resolve because Horizon rate-limited us, the
 * response is marked non-cacheable so the next request retries instead
 * of serving "no market" for a minute.
 */
export async function GET() {
  const xlm = await fetchXlmUsd();

  const tokens = await Promise.all(TOKEN_REGISTRY.map((t) => resolveToken(t, xlm.priceUsd)));
  const allResolved = tokens.every((t) => t.resolved);

  const body: TokensResponse = { updatedAt: Date.now(), xlm, tokens };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": allResolved
        ? "public, s-maxage=60, stale-while-revalidate=300"
        : "no-store",
    },
  });
}
