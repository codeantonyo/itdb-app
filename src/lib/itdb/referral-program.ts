/**
 * The referral program, October 2026 edition — the figures from the
 * channel post. Pure data, safe to import on the client.
 *
 * Everything here is credited IN THE APP and locked until "the flip";
 * nothing is sent on chain. (The earlier 10,000-ITDB-on-chain program
 * is closed to new referrals; what it already owes still pays out.)
 */

/** The five ICOs a member picks their tokens from. */
export const ICO_CODES = ["ITDB", "ITDBONE", "QRS", "ITDBVAULT", "ITDBATMS"] as const;
export type IcoCode = (typeof ICO_CODES)[number];

/** JOIN — the friend joins the channel and registers: both get this. */
export const JOIN_TOKENS = 250;
/** BUY — the friend invests this much XLM in the ICOs: both get the rest. */
export const BUY_XLM = 100;
export const BUY_USDC = 1_000;
export const BUY_TOKENS = 1_000;

export interface LadderStep {
  friends: number;
  usdc: number;
  atms: number;
  vaults: number;
  extras: string[];
}

/** By qualified friends. Steps replace each other: reaching 10 is 15,000 USDC, not 5,000 + 15,000. */
export const LADDER: LadderStep[] = [
  { friends: 5, usdc: 5_000, atms: 1, vaults: 1, extras: [] },
  { friends: 10, usdc: 15_000, atms: 3, vaults: 3, extras: [] },
  { friends: 25, usdc: 30_000, atms: 5, vaults: 5, extras: ["Council seat", "Your name on the Founders Wall, in gold"] },
];
export const ladderStep = (qualified: number) => [...LADDER].reverse().find((s) => qualified >= s.friends) ?? null;

/** No more than this many referrals count per referrer per UTC day. */
export const DAILY_REFERRAL_CAP = 50;

export const GIVEAWAY = {
  title: "GIVEAWAY — END OF OCTOBER",
  /** Counted from referrals who registered in this UTC month */
  year: 2026,
  month: 9, // October
  minimum: 10,
  prizes: [
    { place: 1, medal: "🥇", usd: 1_000_000 },
    { place: 2, medal: "🥈", usd: 500_000 },
    { place: 3, medal: "🥉", usd: 250_000 },
    { place: 4, medal: "🎖", usd: 100_000 },
    { place: 5, medal: "🏅", usd: 100_000 },
  ],
  rules: [
    "Only new real members count",
    "Minimum 10 new members to enter",
    "Ranked by how many new members you bring to the channel",
    "We verify everything — no bots, no fake accounts",
    "If fewer than 5 reach the minimum, the remaining prizes roll over to next month",
  ],
};

/** Shown in the app; checked by the team, not by the app. */
export const VERIFICATION_RULES = [
  "Friend's account at least 30 days old",
  "Joins the channel AND registers in the app",
  "His own wallet — one wallet = one person",
  "Stays in the channel at least 14 days",
  "No bots · no fake accounts · no shared wallets · no rings",
  `At most ${DAILY_REFERRAL_CAP} referrals a day`,
];
