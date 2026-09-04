"use client";

import { useSyncExternalStore } from "react";

/** Local (in-app) notifications — card events etc. */

export interface LocalNotification {
  id: string;
  kind: "card_ready" | "system";
  title: string;
  body: string;
  /** ISO timestamp */
  at: string;
}

const localKeyFor = (address: string) => `itdb:localNotifs:${address}`;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: LocalNotification[] = [];
const cache = new Map<string, { raw: string | null; value: LocalNotification[] }>();

function readLocal(address: string | null): LocalNotification[] {
  if (!address) return EMPTY;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(localKeyFor(address));
  } catch {
    raw = null;
  }
  const cached = cache.get(address);
  if (cached && cached.raw === raw) return cached.value;
  let value: LocalNotification[] = EMPTY;
  try {
    value = raw ? (JSON.parse(raw) as LocalNotification[]) : EMPTY;
  } catch {
    value = EMPTY;
  }
  cache.set(address, { raw, value });
  return value;
}

export function addLocalNotification(
  address: string,
  notification: Pick<LocalNotification, "kind" | "title" | "body">,
) {
  try {
    const next: LocalNotification[] = [
      ...readLocal(address),
      { id: crypto.randomUUID(), at: new Date().toISOString(), ...notification },
    ].slice(-50);
    localStorage.setItem(localKeyFor(address), JSON.stringify(next));
  } catch {
    /* private mode */
  }
  emit();
}

export function useLocalNotifications(address: string | null) {
  return useSyncExternalStore(
    subscribe,
    () => readLocal(address),
    () => EMPTY,
  );
}
