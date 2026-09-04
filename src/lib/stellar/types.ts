/** Shared shapes for the Stellar data layer (API routes ⇄ client). */

export interface PricePoint {
  /** unix ms */
  t: number;
  /** USD value */
  v: number;
}

export interface TokenMeta {
  code: string;
  issuer: string;
  name: string;
  image: string | null;
  desc: string | null;
  /** Issuer home domain from the on-chain account (SEP-1) */
  domain: string | null;
  /** Mid-market price on the Stellar DEX, in XLM. null = no market */
  priceXlm: number | null;
  priceUsd: number | null;
  /** 24h percent change derived from DEX trade aggregations */
  change24h: number | null;
  /** ~7 day USD price history (daily closes) */
  history: PricePoint[];
  hasMarket: boolean;
  /**
   * True when every Horizon lookup behind this row resolved. False means
   * a lookup was rate-limited — price/metadata may be stale or missing
   * and the UI must say so rather than show "no market".
   */
  resolved: boolean;
}

export interface TokensResponse {
  updatedAt: number;
  xlm: {
    priceUsd: number;
    change24h: number;
    history: PricePoint[];
  };
  tokens: TokenMeta[];
}

export interface AccountBalance {
  code: string;
  /** null for native XLM */
  issuer: string | null;
  balance: number;
}

export interface AccountPayment {
  id: string;
  direction: "received" | "sent" | "other";
  kind: string;
  code: string;
  amount: number;
  counterparty: string | null;
  at: string;
}

export interface AccountResponse {
  exists: boolean;
  id: string;
  balances: AccountBalance[];
  payments: AccountPayment[];
}
