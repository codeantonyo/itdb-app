# ITDB — International Tokenized Development Bank

A consumer bank on Stellar. Built as a sibling to NEWBANK: the same
engineering spine (signed sessions, OTP + login throttling, Telegram
auto-login, sharded Postgres, Horizon backoff), a deliberately different
product and design (MERIDIAN: navy, gold leaf, serif display, engraved
line-work).

## Run it

```bash
npm install
npm run dev
```

With no `POSTGRES_URL` the account database lives in `data/db.json` and
OTP codes print to the console and the screen (dev mode). Copy
`.env.example` to `.env.local` to configure Postgres, Brevo email, the
Telegram bot and the admin wallet.

## Where things live

| Area | Path |
|---|---|
| Horizon backoff (`horizonJson` three-way result) | `src/lib/stellar/horizon-fetch.ts` |
| Token metadata + DEX price (SEP-1 → StellarExpert) | `src/lib/stellar/horizon.ts` |
| The three tokens | `src/lib/stellar/registry.ts` |
| Tier tables (from `tiers.draft.ts`) | `src/lib/itdb/config.ts` |
| Sharded Postgres / file DB | `src/lib/server/db.ts` |
| Sessions, OTP, mailer, Telegram | `src/lib/server/{session,otp,mailer,telegram}.ts` |
| FX (fiat, crypto, metals) | `src/lib/server/fx.ts` |
| Ledger credits (xlmValue guard) | `src/lib/server/ledger.ts` |
| Daily-yield accrual (the ONE anchor move) | `src/lib/server/accrual.ts` |
| Design tokens | `src/app/globals.css` |

## Engineering rules carried from NEWBANK

1. Every ledger credit sets a real `xlmValue` — `ledger.ts` throws otherwise.
2. The accrual anchor (`collectedAt`) moves only inside `collectYield`.
3. Tier eligibility comes from what the member holds, never from
   subtracting one funding route from another.
4. A Horizon 429 is unknown, not zero — routes return 503, the UI shows
   "figures unavailable".
5. Compact figures carry four significant digits and every money figure
   is one tap from exact.

## Open decisions (see `ITDB-BRIEF.md` §8)

- `ITDBONE_LADDER` in `src/lib/itdb/config.ts` picks which of the two
  hold ranges is authoritative. Defaults to the first (higher) set.
- `QRS_GOLD_BASIS` picks between the 100 g-per-token rule and the tier
  table (which is exactly 2×). Defaults to the conservative per-token
  rule; the tier figure is shown alongside.
