"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MAX_WALLETS } from "@/lib/itdb/config";
import { REFERRAL_RE, referralCodeFor } from "@/lib/referral";
import { clearCache } from "./fetch-cache";

export type Role = "admin" | "user";

/** Account payload returned by the auth API. */
export interface AccountPayload {
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

export interface Session {
  /** Server account id */
  accountId: string;
  /** Primary wallet address */
  address: string;
  /** All connected wallets (always includes the primary) */
  wallets: string[];
  name: string;
  email: string | null;
  username: string;
  role: Role;
  referralCode: string;
  referredBy: string | null;
  createdAt: number;
}

const SESSION_KEY = "itdb:session";

/**
 * Set on an explicit logout, cleared on a manual sign-in. While set,
 * Telegram Mini App auto-login is suppressed — otherwise tapping
 * "Sign out" would be undone instantly (NEWBANK's "logout does nothing"
 * bug for Mini App users). Device-local; deliberately NOT synced.
 */
const NO_AUTOLOGIN_KEY = "itdb:noAutoLogin";

export function isAutoLoginSuppressed(): boolean {
  try {
    return localStorage.getItem(NO_AUTOLOGIN_KEY) === "1";
  } catch {
    return false;
  }
}

function setAutoLoginSuppressed(on: boolean): void {
  try {
    if (on) localStorage.setItem(NO_AUTOLOGIN_KEY, "1");
    else localStorage.removeItem(NO_AUTOLOGIN_KEY);
  } catch {
    /* private mode */
  }
}

export const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/** Referral deep links open the app with ?ref=ITDB-XXXXXX. */
const PENDING_REF_KEY = "itdb:pendingRef";

export function capturePendingReferral(): void {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && REFERRAL_RE.test(ref)) localStorage.setItem(PENDING_REF_KEY, ref.toUpperCase());
  } catch {
    /* private mode */
  }
}

export function pendingReferral(): string {
  try {
    return localStorage.getItem(PENDING_REF_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(PENDING_REF_KEY);
  } catch {
    /* private mode */
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  localStorage-backed session store (useSyncExternalStore)           */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function normalizeSession(parsed: Partial<Session>): Session | null {
  const address = parsed.address;
  if (!address || !STELLAR_ADDRESS_RE.test(address)) return null;
  return {
    accountId: parsed.accountId ?? "",
    address,
    wallets:
      Array.isArray(parsed.wallets) && parsed.wallets.includes(address)
        ? parsed.wallets.filter((w) => STELLAR_ADDRESS_RE.test(w))
        : [address],
    name: parsed.name ?? "Member",
    email: parsed.email ?? null,
    username: parsed.username ?? "",
    role: parsed.role === "admin" ? "admin" : "user",
    referralCode: parsed.referralCode ?? referralCodeFor(address),
    referredBy: parsed.referredBy ?? null,
    createdAt: parsed.createdAt ?? Date.now(),
  };
}

let cacheRaw: string | null | undefined;
let cacheValue: Session | null = null;

function getSnapshot(): Session | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SESSION_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cacheValue = raw ? normalizeSession(JSON.parse(raw)) : null;
    } catch {
      cacheValue = null;
    }
  }
  return cacheValue;
}

const getServerSnapshot = () => null;

function write(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode */
  }
  emit();
}

/** Fire-and-forget sync of session changes back to the server. */
function syncToServer(patch: { id: string; name?: string; username?: string; wallets?: string[] }) {
  if (!patch.id) return;
  fetch("/api/auth/account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

export function useAuth() {
  const session = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // false during SSR/hydration, true once the client store is live
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  /** Establish a session from a verified server account. */
  const signIn = useCallback((account: AccountPayload) => {
    const normalized = normalizeSession({
      accountId: account.id,
      address: account.wallets[0],
      wallets: account.wallets,
      name: account.name,
      email: account.email,
      username: account.username,
      role: account.role,
      referralCode: account.referralCode,
      referredBy: account.referredBy,
      createdAt: account.createdAt,
    });
    if (normalized) {
      setAutoLoginSuppressed(false);
      write(normalized);
    }
  }, []);

  const signOut = useCallback(() => {
    // Suppress auto-login FIRST, so the session-cleared re-render can't
    // race the Telegram effect back into a signed-in state.
    setAutoLoginSuppressed(true);
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    // Never let the next member see the previous one's cached figures.
    clearCache();
    write(null);
  }, []);

  const updateSession = useCallback((patch: Partial<Session>) => {
    const current = getSnapshot();
    if (!current) return;
    const next = normalizeSession({ ...current, ...patch });
    if (!next) return;
    write(next);
    syncToServer({ id: next.accountId, name: patch.name, username: patch.username });
  }, []);

  /** Returns an error message, or null when the wallet was linked. */
  const addWallet = useCallback((address: string): string | null => {
    const current = getSnapshot();
    if (!current) return "Sign in again.";
    if (!STELLAR_ADDRESS_RE.test(address)) {
      return "A Stellar address starts with G and has 56 characters.";
    }
    if (current.wallets.includes(address)) return "That wallet is already linked.";
    if (current.wallets.length >= MAX_WALLETS) {
      return `You can link up to ${MAX_WALLETS} wallets. Remove one first.`;
    }
    const wallets = [...current.wallets, address];
    write({ ...current, wallets });
    syncToServer({ id: current.accountId, wallets });
    return null;
  }, []);

  const removeWallet = useCallback((address: string) => {
    const current = getSnapshot();
    if (!current || address === current.address) return; // keep primary
    const wallets = current.wallets.filter((w) => w !== address);
    write({ ...current, wallets });
    syncToServer({ id: current.accountId, wallets });
  }, []);

  return { session, ready, signIn, signOut, updateSession, addWallet, removeWallet };
}
