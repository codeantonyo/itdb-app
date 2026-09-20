/**
 * Milestone bonuses and special promotions, per token.
 *
 * TWO RULES GOVERN THIS FILE, and both are enforced by its shape:
 *
 * 1. STRICT TOKEN SEPARATION. Every milestone names the one token it
 *    belongs to, and `activeMultiplier` only ever reads milestones for
 *    the token it was asked about. An ITDB bonus can never reach an
 *    ITDBONE or QRS holder.
 *
 * 2. PROGRESSIVE, NEVER STACKED. When several multipliers are active
 *    for a token, the HIGHEST one applies. ×50, ×150 and ×300 active
 *    together means ×300, not ×500.
 *
 * Statuses are declared here rather than derived from chain: "75% sold
 * out" depends on how much the distributor still holds, and guessing at
 * that number would gate real member rewards on a guess. Flip a status
 * when the milestone genuinely lands. See `soldTarget` for the figure
 * each one is waiting on.
 */

export type TokenCode = "ITDB" | "ITDBONE" | "QRS" | "ITDBVAULT";

export type MilestoneStatus =
  /** Reached and applying now */
  | "active"
  /** Reached and already paid out — shown for the record, adds nothing live */
  | "delivered"
  /** Not reached; contributes nothing */
  | "locked";

/** What a multiplier scales. Keeps a daily-yield boost off the basket. */
export type MultiplierTarget = "basket" | "daily" | "gold";

export interface Milestone {
  id: string;
  token: TokenCode;
  title: string;
  detail: string;
  status: MilestoneStatus;
  /** Threshold in words, for the member */
  threshold?: string;
  /** Tokens that must be sold, when the milestone is a sale target */
  soldTarget?: number;
  /** Reward multiplier conferred while active. Highest active wins. */
  multiplier?: number;
  target?: MultiplierTarget;
  /** True when only some holders qualify (e.g. pre-sale buyers) */
  restricted?: boolean;
  /**
   * Exact amount owed to THIS member, already formatted. Present only on
   * milestones whose value differs per member, such as the pre-sale
   * bonuses built from the allowlist.
   */
  amount?: string;
}

/* ------------------------------------------------------------------ */
/*  ITDB BANK                                                          */
/* ------------------------------------------------------------------ */

const ITDB_MILESTONES: Milestone[] = [
  {
    id: "itdb-x300",
    token: "ITDB",
    title: "×300 rewards",
    detail: "Your whole reserve basket is multiplied by 300.",
    status: "active",
    threshold: "75% sold out",
    soldTarget: 75_000,
    multiplier: 300,
    target: "basket",
  },
  {
    id: "itdb-x500",
    token: "ITDB",
    title: "×500 rewards",
    detail: "Raises the basket multiplier from ×300 to ×500.",
    status: "locked",
    threshold: "100% sold out",
    soldTarget: 100_000,
    multiplier: 500,
    target: "basket",
  },
  {
    id: "itdb-x10-tokens",
    token: "ITDB",
    title: "×10 tokens bonus",
    detail: "Every ITDB holder received ten times the tokens they bought. Already in your on-chain balance.",
    status: "delivered",
  },
];

/* ------------------------------------------------------------------ */
/*  ITDB ONE                                                           */
/* ------------------------------------------------------------------ */

const ITDBONE_MILESTONES: Milestone[] = [
  {
    id: "itdbone-x10",
    token: "ITDBONE",
    title: "×10 rewards multiplier",
    detail: "Your daily allowance is multiplied by 10.",
    status: "active",
    threshold: "50% sold out",
    multiplier: 10,
    target: "daily",
  },
  {
    id: "itdbone-double-tokens",
    token: "ITDBONE",
    title: "Double your tokens",
    detail: "Unlocked alongside the ×10 multiplier. Already in your on-chain balance.",
    status: "delivered",
  },
  {
    id: "itdbone-reset",
    token: "ITDBONE",
    title: "The Reset Package",
    detail: "Unlocks when ITDB ONE sells out.",
    status: "locked",
    threshold: "100% sold out",
  },
  {
    id: "itdbone-share",
    token: "ITDBONE",
    title: "Share in the bank",
    detail: "For the top 100 ITDB ONE holders when the sale completes.",
    status: "locked",
    threshold: "100% sold out",
    restricted: true,
  },
  {
    id: "itdbone-council",
    token: "ITDBONE",
    title: "Founder's Council",
    detail: "For the top 100 ITDB ONE holders when the sale completes.",
    status: "locked",
    threshold: "100% sold out",
    restricted: true,
  },
];

/* ------------------------------------------------------------------ */
/*  QRS                                                                */
/* ------------------------------------------------------------------ */

const QRS_MILESTONES: Milestone[] = [
  {
    id: "qrs-m1",
    token: "QRS",
    title: "25% QRS bonus",
    detail:
      "Unlocked. Existing holders receive 25% of their balance at once; " +
      "anyone who buys from now on receives it on reaching Tier 1.",
    status: "active",
    threshold: "2,500,000 QRS sold",
    soldTarget: 2_500_000,
  },
  {
    id: "qrs-m2",
    token: "QRS",
    title: "Pre-flip liquidity pool",
    detail: "50,000 XLM, 20,000 XRP and 10,000 USDT into the QFS Vault for every holder.",
    status: "locked",
    threshold: "5,000,000 QRS sold",
    soldTarget: 5_000_000,
  },
  {
    id: "qrs-m3",
    token: "QRS",
    title: "500% APY boost + Grand Final Pool",
    detail: "Three months of boosted APY, plus 100,000 XLM and 50,000 USDT to all holders.",
    status: "locked",
    threshold: "100% sold out",
  },
];

const BY_TOKEN: Record<TokenCode, Milestone[]> = {
  ITDB: ITDB_MILESTONES,
  ITDBONE: ITDBONE_MILESTONES,
  QRS: QRS_MILESTONES,
  // ITDBVAULT's stages are derived from vaults actually sold, so they
  // are built by vaultMilestones() rather than declared here.
  ITDBVAULT: [],
};

/** Every milestone for one token, in the order members should read them. */
export function milestonesFor(token: TokenCode): Milestone[] {
  return BY_TOKEN[token];
}

export interface ActiveMultiplier {
  /** 1 when nothing is active — never 0, so it is safe to multiply by */
  value: number;
  /** The milestone supplying it, or null */
  from: Milestone | null;
  /** The next locked milestone that would raise it, if any */
  next: Milestone | null;
}

/**
 * The multiplier in force for one token and one target.
 *
 * Reads ONLY that token's milestones, takes the HIGHEST active value,
 * and never sums. Returns 1 when nothing is active, so callers can
 * multiply unconditionally.
 */
export function activeMultiplier(token: TokenCode, target: MultiplierTarget): ActiveMultiplier {
  const relevant = BY_TOKEN[token].filter((m) => m.target === target && m.multiplier != null);
  const active = relevant.filter((m) => m.status === "active");

  const from = active.reduce<Milestone | null>(
    (best, m) => (best === null || m.multiplier! > best.multiplier! ? m : best),
    null,
  );
  const value = from?.multiplier ?? 1;

  // The cheapest locked milestone that would actually raise the figure.
  const next = relevant
    .filter((m) => m.status === "locked" && (m.multiplier ?? 0) > value)
    .sort((a, b) => a.multiplier! - b.multiplier!)[0] ?? null;

  return { value, from, next };
}
