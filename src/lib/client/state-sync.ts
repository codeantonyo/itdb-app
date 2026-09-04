"use client";

/**
 * Durable state sync — backs up per-account browser state to the server
 * and restores it on any device / after a cookie clear.
 *
 * The stores keep their data in namespaced localStorage keys
 * (`itdb:cards:*`, `itdb:localNotifs:*`). We snapshot those keys to the
 * server and hydrate them back on login, so clearing cookies never loses
 * a member's card.
 */

/** Key prefixes that represent durable per-account state (synced). */
const SYNCED_PREFIXES = ["itdb:cards:", "itdb:localNotifs:", "itdb:notifCleared:"];

// Device-local preferences (session, theme) are intentionally excluded.

function isSynced(key: string): boolean {
  return SYNCED_PREFIXES.some((p) => key.startsWith(p));
}

function snapshotLocal(): Record<string, string> {
  const blob: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isSynced(key)) {
        const value = localStorage.getItem(key);
        if (value !== null) blob[key] = value;
      }
    }
  } catch {
    /* private mode */
  }
  return blob;
}

/**
 * Pull server state and hydrate any missing local keys. Returns true if
 * it restored data that wasn't in this browser.
 */
export async function pullState(accountId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/user/state?id=${accountId}`);
    if (!res.ok) return false;
    const { blob } = (await res.json()) as { blob: Record<string, string> };
    let hydrated = false;
    for (const [key, value] of Object.entries(blob)) {
      if (!isSynced(key)) continue;
      // Only restore keys the browser is missing — never clobber newer
      // local edits made this session.
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
        hydrated = true;
      }
    }
    return hydrated;
  } catch {
    return false;
  }
}

let lastPushed = "";

/** Push the current local snapshot to the server (no-op if unchanged). */
export async function pushState(
  accountId: string,
  opts: { keepalive?: boolean } = {},
): Promise<void> {
  const blob = snapshotLocal();
  const serialized = JSON.stringify(blob);
  if (serialized === lastPushed || serialized === "{}") return;
  try {
    await fetch("/api/user/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: accountId, blob }),
      keepalive: opts.keepalive,
    });
    lastPushed = serialized;
  } catch {
    /* offline — retried on next tick */
  }
}

export function resetSyncCache() {
  lastPushed = "";
}
