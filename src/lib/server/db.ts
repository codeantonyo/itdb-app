import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { Pool } from "pg";

/**
 * Account database with two interchangeable backends (ported from
 * NEWBANK, tables renamed to `itdb_shards` / `itdb_shard_meta`):
 *
 * - **Postgres** (production / Vercel): set `POSTGRES_URL` (or
 *   `DATABASE_URL`). Each entity lives in its own JSONB row ("shard"),
 *   stamped with a globally serialized version counter — reads refresh
 *   incrementally (only changed rows transfer) and writes move only the
 *   rows they touch, with stale writers rolled back and retried.
 * - **Local file** (development): `data/db.json`, atomic temp-file
 *   renames + a process-wide write lock.
 *
 * API routes and the client only ever see `getDb` / `mutateDb`.
 */

export type Role = "admin" | "user";

export interface DbAccount {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  username: string;
  passwordHash: string;
  salt: string;
  role: Role;
  wallets: string[];
  referralCode: string;
  referredBy: string | null;
  createdAt: number;
  /** Telegram user bound to this account (Mini App auto-login). */
  telegramId?: number;
}

/** Escalating-cooldown counter (OTP resends, login failures). */
export interface ThrottleRecord {
  count: number;
  lastAt: number;
}

/** One card's spendable balance in its chosen currency (in-app funds). */
export interface CardBalance {
  currency: string;
  balance: number;
}

/** A money movement between the main account, the card and yield sources. */
export interface LedgerTxn {
  id: string;
  at: number;
  /** "account", a cardId, or a yield source ("itdbone" | "qrs") */
  from: string;
  to: string;
  /** Amount credited to the destination, in the destination's currency */
  amount: number;
  currency: string;
  /**
   * Canonical XLM value of the movement. MUST be a real, positive
   * figure on every credit — the account balance is derived as
   * portfolio − net(account→card), so a credit with xlmValue 0 posts a
   * transaction the member can see but no spendable money (§6.1).
   */
  xlmValue: number;
}

/** Per-account custodial ledger: card balances + movement history. */
export interface AccountLedger {
  cards: Record<string, CardBalance>;
  txns: LedgerTxn[];
}

/** One collected yield payout. */
export interface YieldClaim {
  id: string;
  at: number;
  usd: number;
  tier: number;
  /** "account" or a cardId */
  destination: string;
  lines: { code: string; units: number; usd: number }[];
}

/**
 * Accrual state for one yield programme (ITDBONE or QRS).
 *
 * `collectedAt` is the accrual checkpoint. It moves in EXACTLY ONE
 * place — the collect path in src/lib/server/accrual.ts — and a fresh
 * record starts at 0, never at "now". Stamping now on creation is what
 * silently wiped 266 NEWPAY members' uncollected salary (§6.2).
 */
export interface YieldRecord {
  collectedAt: number;
  collectedUsd: number;
  claims: YieldClaim[];
}

export type OtpPurpose = "signup" | "reset" | "change_email";

export interface OtpRecord {
  /** Target email (for change_email this is the NEW address) */
  email: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

/** Account shape returned to the client — never includes secrets. */
export interface PublicAccount {
  id: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  wallets: string[];
  referralCode: string;
  referredBy: string | null;
  createdAt: number;
}

/**
 * Server-persisted per-account state: a snapshot of the account's
 * namespaced localStorage keys (the card, notifications) so it survives
 * cookie clears and follows the member to any device.
 */
export interface UserStateRecord {
  blob: Record<string, string>;
  updatedAt: number;
}

export interface DbShape {
  accounts: DbAccount[];
  otps: OtpRecord[];
  /** Durable per-account state backup, keyed by accountId */
  userStates: Record<string, UserStateRecord>;
  /** HMAC key for session cookies — generated once (unless SESSION_SECRET is set) */
  sessionSecret?: string;
  /** OTP resend ladder per email */
  otpThrottle: Record<string, ThrottleRecord>;
  /** Failed-login counters per identifier */
  loginThrottle: Record<string, ThrottleRecord>;
  /** Per-account card balances + transfer history, keyed by accountId */
  ledgers: Record<string, AccountLedger>;
  /** Cache of "first acquired asset X" per `address:code:issuer`. */
  acquired: Record<string, { value: number | null; at: number }>;
  /** ITDBONE yield records, keyed by accountId */
  itdbone: Record<string, YieldRecord>;
  /** QRS yield records, keyed by accountId */
  qrs: Record<string, YieldRecord>;
}

const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "db.json");

/* ------------------------------------------------------------------ */
/*  Password hashing                                                   */
/* ------------------------------------------------------------------ */

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, account: DbAccount): boolean {
  const candidate = Buffer.from(hashPassword(password, account.salt), "hex");
  const stored = Buffer.from(account.passwordHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

/**
 * Serialize writes across the whole process. Held on globalThis because
 * Next can instantiate this module more than once (dev HMR, separate
 * route bundles) — a per-module lock would let writes interleave.
 */
const lockHolder = globalThis as typeof globalThis & {
  __itdbWriteLock?: Promise<void>;
};
lockHolder.__itdbWriteLock ??= Promise.resolve();

const emptyDb = (): DbShape => ({
  accounts: [],
  otps: [],
  userStates: {},
  otpThrottle: {},
  loginThrottle: {},
  ledgers: {},
  acquired: {},
  itdbone: {},
  qrs: {},
});

const obj = <T>(v: unknown, fallback: T): T =>
  v && typeof v === "object" ? (v as T) : fallback;

/**
 * Upgrade any stored shape (file or Postgres) to the current DbShape.
 *
 * CRITICAL: only a genuinely missing file yields an empty database. Any
 * other failure (unreadable, malformed JSON) throws, because returning
 * "empty" here would let a caller seed + write over every real account.
 */
function normalizeDb(db: Partial<DbShape>): DbShape {
  if (!Array.isArray(db.accounts)) {
    throw new Error("Stored database is malformed — refusing to overwrite it.");
  }
  return {
    accounts: db.accounts.map((a) => ({ ...a, emailVerified: a.emailVerified ?? true })),
    otps: Array.isArray(db.otps) ? db.otps : [],
    userStates: obj(db.userStates, {}),
    sessionSecret: typeof db.sessionSecret === "string" ? db.sessionSecret : undefined,
    otpThrottle: obj(db.otpThrottle, {}),
    loginThrottle: obj(db.loginThrottle, {}),
    ledgers: obj(db.ledgers, {}),
    acquired: obj(db.acquired, {}),
    itdbone: obj(db.itdbone, {}),
    qrs: obj(db.qrs, {}),
  };
}

async function readDb(): Promise<DbShape> {
  let raw: string;
  try {
    raw = await fs.readFile(DB_FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyDb();
    throw e;
  }
  return normalizeDb(JSON.parse(raw) as Partial<DbShape>);
}

/**
 * Write atomically: a reader can only ever see a complete file. Without
 * this, writeFile truncates first and a concurrent read gets partial
 * JSON — which once wiped NEWBANK's database.
 */
async function writeDb(db: DbShape): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");

  // Windows can transiently refuse to replace a file another handle has
  // open (EPERM/EBUSY), so retry briefly before giving up.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, DB_FILE);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      const retryable = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!retryable || attempt >= 9) {
        await fs.rm(tmp, { force: true }).catch(() => {});
        throw e;
      }
      await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Postgres backend (production / Vercel)                             */
/* ------------------------------------------------------------------ */

const PG_URL = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
const usePostgres = PG_URL.length > 0;

/**
 * Fail loudly on the first database access instead of silently 500-ing
 * on Vercel's read-only filesystem. Deliberately NOT thrown at module
 * load: the build imports route modules to collect page data.
 */
function assertBackendConfigured(): void {
  if (process.env.VERCEL && !usePostgres) {
    throw new Error(
      "Running on Vercel without a database: set POSTGRES_URL (or DATABASE_URL) " +
        "in the project's environment variables.",
    );
  }
}

const pgHolder = globalThis as typeof globalThis & {
  __itdbPgPool?: Pool;
  __itdbPgReady?: Promise<void>;
  __itdbPgCache?: PgCache;
};

function pgPool(): Pool {
  pgHolder.__itdbPgPool ??= new Pool({
    connectionString: PG_URL,
    max: 3,
    // Hosted Postgres (Supabase/Neon/Vercel) requires TLS; local doesn't.
    ssl: /localhost|127\.0\.0\.1/.test(PG_URL)
      ? undefined
      : { rejectUnauthorized: false },
  });
  return pgHolder.__itdbPgPool;
}

/**
 * Per-shard storage:
 *
 *   account:<id>    one DbAccount
 *   userstate:<id>  one UserStateRecord
 *   ledger:<id>     one AccountLedger
 *   itdbone:<id>    one YieldRecord
 *   qrs:<id>        one YieldRecord
 *   otps / otpThrottle / loginThrottle / acquired / meta   singletons
 *
 * Every committed write bumps a global counter (`itdb_shard_meta`) and
 * stamps its rows with that version. Writers serialize on the counter
 * row, so commit order == version order, and a cached instance can
 * refresh with "SELECT shard, version WHERE version > my-high-water
 * -mark" and fetch only rows it hasn't seen.
 */
interface ShardEntry {
  version: number;
  /** Canonical serialization of `value` — dirty-detection compares this */
  raw: string;
  /** Parsed blob; null = tombstone (deleted entity) */
  value: unknown;
}

interface PgCache {
  at: number;
  hwm: number;
  shards: Map<string, ShardEntry>;
  /** Assembled view — READ-ONLY (mutations go through pgMutateDb) */
  db: DbShape;
}

const DB_READ_TTL = 20_000;

function pgEnsure(): Promise<void> {
  if (!pgHolder.__itdbPgReady) {
    const ready = (async () => {
      const pool = pgPool();
      await pool.query(
        `CREATE TABLE IF NOT EXISTS itdb_shards (
           shard TEXT PRIMARY KEY,
           version BIGINT NOT NULL,
           blob JSONB
         )`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS itdb_shards_version ON itdb_shards (version)`,
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS itdb_shard_meta (
           id INT PRIMARY KEY,
           version BIGINT NOT NULL
         )`,
      );
      await pool.query(
        `INSERT INTO itdb_shard_meta (id, version) VALUES (1, 0)
         ON CONFLICT (id) DO NOTHING`,
      );
    })();
    // A transient failure must not poison every later call.
    pgHolder.__itdbPgReady = ready.catch((e) => {
      pgHolder.__itdbPgReady = undefined;
      throw e;
    });
  }
  return pgHolder.__itdbPgReady;
}

/** DbShape → shard rows (canonical serialized form). */
function splitDb(db: DbShape): Map<string, string> {
  const out = new Map<string, string>();
  out.set("meta", JSON.stringify({ sessionSecret: db.sessionSecret ?? null }));
  out.set("otps", JSON.stringify(db.otps));
  out.set("otpThrottle", JSON.stringify(db.otpThrottle));
  out.set("loginThrottle", JSON.stringify(db.loginThrottle));
  out.set("acquired", JSON.stringify(db.acquired));
  for (const a of db.accounts) out.set(`account:${a.id}`, JSON.stringify(a));
  for (const [id, s] of Object.entries(db.userStates))
    out.set(`userstate:${id}`, JSON.stringify(s));
  for (const [id, l] of Object.entries(db.ledgers))
    out.set(`ledger:${id}`, JSON.stringify(l));
  for (const [id, y] of Object.entries(db.itdbone))
    out.set(`itdbone:${id}`, JSON.stringify(y));
  for (const [id, y] of Object.entries(db.qrs))
    out.set(`qrs:${id}`, JSON.stringify(y));
  return out;
}

/** Shard rows → DbShape (normalized like every other read path). */
function assembleDb(shards: Map<string, ShardEntry>): DbShape {
  const db = emptyDb();
  for (const [shard, entry] of shards) {
    const value = entry.value;
    if (value === null || value === undefined) continue; // tombstone
    if (shard === "meta") {
      const secret = (value as { sessionSecret?: string | null }).sessionSecret;
      if (typeof secret === "string") db.sessionSecret = secret;
    } else if (shard === "otps") db.otps = value as OtpRecord[];
    else if (shard === "otpThrottle")
      db.otpThrottle = value as Record<string, ThrottleRecord>;
    else if (shard === "loginThrottle")
      db.loginThrottle = value as Record<string, ThrottleRecord>;
    else if (shard === "acquired") db.acquired = value as DbShape["acquired"];
    else if (shard.startsWith("account:")) db.accounts.push(value as DbAccount);
    else if (shard.startsWith("userstate:"))
      db.userStates[shard.slice(10)] = value as UserStateRecord;
    else if (shard.startsWith("ledger:"))
      db.ledgers[shard.slice(7)] = value as AccountLedger;
    else if (shard.startsWith("itdbone:"))
      db.itdbone[shard.slice(8)] = value as YieldRecord;
    else if (shard.startsWith("qrs:"))
      db.qrs[shard.slice(4)] = value as YieldRecord;
  }
  db.accounts.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return normalizeDb(db);
}

/**
 * Shard kinds THIS code version reads and writes. A row of any other
 * kind is passed over untouched — never tombstoned — so a newer
 * deployment's shards survive a brief old/new instance overlap.
 */
const OWNED_SHARD_RE =
  /^(meta|otps|otpThrottle|loginThrottle|acquired)$|^(account|userstate|ledger|itdbone|qrs):/;

function entryFromRow(row: {
  shard: string;
  version: string | number;
  blob: unknown;
}): [string, ShardEntry] {
  const value = row.blob ?? null;
  return [
    row.shard,
    { version: Number(row.version), raw: JSON.stringify(value), value },
  ];
}

async function pgSync(maxAgeMs = DB_READ_TTL): Promise<PgCache> {
  await pgEnsure();
  const pool = pgPool();
  const cache = pgHolder.__itdbPgCache;

  if (!cache) {
    const rows = (await pool.query("SELECT shard, version, blob FROM itdb_shards")).rows;
    const shards = new Map(rows.map(entryFromRow));
    const fresh: PgCache = {
      at: Date.now(),
      hwm: rows.reduce((m, r) => Math.max(m, Number(r.version)), 0),
      shards,
      db: assembleDb(shards),
    };
    pgHolder.__itdbPgCache = fresh;
    return fresh;
  }

  if (Date.now() - cache.at < maxAgeMs) return cache;

  const changed = (
    await pool.query("SELECT shard, version FROM itdb_shards WHERE version > $1", [
      cache.hwm,
    ])
  ).rows;
  if (changed.length === 0) {
    cache.at = Date.now();
    return cache;
  }
  const missing = changed.filter(
    (r) => cache.shards.get(r.shard)?.version !== Number(r.version),
  );
  const shards = new Map(cache.shards);
  if (missing.length > 0) {
    const rows = (
      await pool.query(
        "SELECT shard, version, blob FROM itdb_shards WHERE shard = ANY($1)",
        [missing.map((r) => r.shard)],
      )
    ).rows;
    for (const row of rows) {
      const [key, entry] = entryFromRow(row);
      shards.set(key, entry);
    }
  }
  const next: PgCache = {
    at: Date.now(),
    hwm: changed.reduce((m, r) => Math.max(m, Number(r.version)), cache.hwm),
    shards,
    db: missing.length > 0 ? assembleDb(shards) : cache.db,
  };
  pgHolder.__itdbPgCache = next;
  return next;
}

async function pgMutateDb<T>(
  mutator: (db: DbShape) => T | Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const cache = await pgSync(0);
    const working = structuredClone(cache.db);
    const result = await mutator(working);

    const after = splitDb(working);
    const writes: { shard: string; raw: string | null }[] = [];
    for (const [shard, raw] of after) {
      if (cache.shards.get(shard)?.raw !== raw) writes.push({ shard, raw });
    }
    for (const [shard, entry] of cache.shards) {
      if (entry.value !== null && !after.has(shard) && OWNED_SHARD_RE.test(shard))
        writes.push({ shard, raw: null });
    }
    if (writes.length === 0) return result;

    const client = await pgPool().connect();
    let committed = false;
    let v = 0;
    try {
      await client.query("BEGIN");
      // The counter row is the global write lock: taking it serializes
      // writers, which is what makes commit order == version order.
      v = Number(
        (
          await client.query(
            "UPDATE itdb_shard_meta SET version = version + 1 WHERE id = 1 RETURNING version",
          )
        ).rows[0].version,
      );
      const stale = await client.query(
        "SELECT 1 FROM itdb_shards WHERE version > $1 LIMIT 1",
        [cache.hwm],
      );
      if ((stale.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
      } else {
        for (const w of writes) {
          await client.query(
            `INSERT INTO itdb_shards (shard, version, blob)
             VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (shard) DO UPDATE
               SET version = EXCLUDED.version, blob = EXCLUDED.blob`,
            [w.shard, v, w.raw],
          );
        }
        await client.query("COMMIT");
        committed = true;
      }
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    if (committed) {
      const shards = new Map(cache.shards);
      for (const w of writes) {
        shards.set(w.shard, {
          version: v,
          raw: w.raw ?? "null",
          value: w.raw === null ? null : JSON.parse(w.raw),
        });
      }
      pgHolder.__itdbPgCache = { at: Date.now(), hwm: v, shards, db: working };
      return result;
    }
    await new Promise((r) => setTimeout(r, 25 * (attempt + 1) + Math.random() * 50));
  }
  throw new Error("Database is busy — the write did not land after retries.");
}

/* ------------------------------------------------------------------ */
/*  Public API (backend-agnostic)                                      */
/* ------------------------------------------------------------------ */

/**
 * Read the database. In Postgres mode this is served from an in-memory
 * per-shard cache that re-validates itself with a tiny version query
 * every DB_READ_TTL. The result is READ-ONLY — callers that mutate MUST
 * go through `mutateDb`.
 */
export async function getDb(): Promise<DbShape> {
  assertBackendConfigured();
  if (usePostgres) return (await pgSync()).db;
  return readDb();
}

export async function mutateDb<T>(
  mutator: (db: DbShape) => T | Promise<T>,
): Promise<T> {
  const run = lockHolder.__itdbWriteLock!.then(async () => {
    assertBackendConfigured();
    if (usePostgres) return pgMutateDb(mutator);
    const db = await getDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  });
  lockHolder.__itdbWriteLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function toPublic(account: DbAccount): PublicAccount {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    username: account.username,
    role: account.role,
    wallets: account.wallets,
    referralCode: account.referralCode,
    referredBy: account.referredBy,
    createdAt: account.createdAt,
  };
}

export function usernameFrom(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 16) || "member";
  if (!taken.has(base)) return base;
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${Date.now() % 10000}`;
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

/* ------------------------------------------------------------------ */
/*  Acquisition-date cache (read-coalesced, fire-and-forget writes)    */
/* ------------------------------------------------------------------ */

let acqMemo: {
  at: number;
  map: Record<string, { value: number | null; at: number }>;
} | null = null;
const ACQ_MEMO_TTL = 5000;

export async function getAcquired(
  key: string,
): Promise<{ value: number | null; at: number } | undefined> {
  if (!acqMemo || Date.now() - acqMemo.at > ACQ_MEMO_TTL) {
    const db = await getDb();
    acqMemo = { at: Date.now(), map: db.acquired ?? {} };
  }
  return acqMemo.map[key];
}

let pendingAcq: Record<string, { value: number | null; at: number }> = {};
let acqFlushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Persist a computed first-acquired value. Writes are batched on a short
 * timer so a burst of cold lookups collapses into a single DB write.
 */
export function saveAcquired(key: string, value: number | null): void {
  const entry = { value, at: Date.now() };
  if (acqMemo) acqMemo.map[key] = entry;
  pendingAcq[key] = entry;
  if (!acqFlushTimer) {
    acqFlushTimer = setTimeout(() => {
      acqFlushTimer = null;
      const batch = pendingAcq;
      pendingAcq = {};
      if (Object.keys(batch).length === 0) return;
      void mutateDb((db) => {
        db.acquired ??= {};
        Object.assign(db.acquired, batch);
      }).catch(() => {});
    }, 3000);
  }
}
