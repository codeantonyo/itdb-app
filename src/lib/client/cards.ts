"use client";

import { useCallback, useSyncExternalStore } from "react";
import { addLocalNotification } from "./notifications";

/**
 * The ITDB card — ONE per account, VISA or Mastercard only (brief §7).
 * Sample/simulated cards, same model as NEWBANK: the card itself lives
 * client-side (synced to the server as durable state), its balance in
 * the server ledger.
 */

export type CardStyle = "sovereign-navy" | "gold-leaf" | "parchment" | "graphite";

export type CardNetwork = "visa" | "mastercard";

export interface StoredCard {
  id: string;
  style: CardStyle;
  network: CardNetwork;
  name: string;
  /** Full 16-digit PAN (simulated, Luhn-valid) */
  number: string;
  expiry: string;
  cvv: string;
  frozen: boolean;
  /** While frozen, unfreezing is locked until this timestamp (min 3 days) */
  frozenUntil: number | null;
  /** Cards issue instantly but activate 1–3 minutes later */
  activatesAt: number;
  readyNotified: boolean;
  createdAt: number;
}

/** Hard product limit — up to three cards per account. */
export const MAX_CARDS = 3;

/** Freeze locks the card for at least this long. */
export const FREEZE_MIN_MS = 3 * 24 * 60 * 60 * 1000;

export const CARD_STYLES: { style: CardStyle; label: string }[] = [
  { style: "sovereign-navy", label: "Sovereign Navy" },
  { style: "gold-leaf", label: "Gold Leaf" },
  { style: "parchment", label: "Parchment" },
  { style: "graphite", label: "Graphite" },
];

export const NETWORKS: { network: CardNetwork; label: string }[] = [
  { network: "visa", label: "Visa" },
  { network: "mastercard", label: "Mastercard" },
];

const keyFor = (address: string) => `itdb:cards:${address}`;

/* ------------------------------------------------------------------ */
/*  Card number generation (simulated issuing)                         */
/* ------------------------------------------------------------------ */

function luhnCheckDigit(digits: number[]): number {
  const sum = digits
    .slice()
    .reverse()
    .reduce((acc, d, i) => {
      if (i % 2 === 0) {
        const doubled = d * 2;
        return acc + (doubled > 9 ? doubled - 9 : doubled);
      }
      return acc + d;
    }, 0);
  return (10 - (sum % 10)) % 10;
}

function randomDigit(): number {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 10;
}

/** Simulated ITDB BINs per network: Visa 4527 10, Mastercard 5318 20. */
const NETWORK_BINS: Record<CardNetwork, number[]> = {
  visa: [4, 5, 2, 7, 1, 0],
  mastercard: [5, 3, 1, 8, 2, 0],
};

/** Generates a Luhn-valid simulated 16-digit PAN. */
export function generateCardNumber(network: CardNetwork = "visa"): string {
  const payload = [...NETWORK_BINS[network]];
  while (payload.length < 15) payload.push(randomDigit());
  payload.push(luhnCheckDigit(payload));
  return payload.join("");
}

export function generateExpiry(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String((date.getFullYear() + 4) % 100).padStart(2, "0");
  return `${month}/${year}`;
}

export function generateCvv(): string {
  return Array.from({ length: 3 }, randomDigit).join("");
}

export function formatPan(pan: string): string {
  return pan.replace(/(.{4})/g, "$1 ").trim();
}

/** Short display label for a card: "Gold Leaf ·· 2343". */
export const cardLabel = (card: StoredCard) => `${card.name} ·· ${card.number.slice(-4)}`;

/** Activation window: random 1–3 minutes per card. */
function randomActivationDelay(): number {
  return (60 + Math.floor(Math.random() * 121)) * 1000;
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

export const isActivating = (card: StoredCard, now: number) =>
  now > 0 && now < card.activatesAt;

export const canUnfreeze = (card: StoredCard, now: number) =>
  card.frozen && (card.frozenUntil === null || now >= card.frozenUntil);

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "now";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/* ------------------------------------------------------------------ */
/*  localStorage-backed per-account card store                         */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: StoredCard[] = [];
const cache = new Map<string, { raw: string | null; value: StoredCard[] }>();

function normalizeCard(card: Partial<StoredCard>): StoredCard {
  return {
    id: card.id ?? crypto.randomUUID(),
    style: card.style ?? "sovereign-navy",
    network: card.network === "mastercard" ? "mastercard" : "visa",
    name: card.name ?? "ITDB Card",
    number: card.number ?? generateCardNumber(),
    expiry: card.expiry ?? generateExpiry(),
    cvv: card.cvv ?? generateCvv(),
    frozen: card.frozen ?? false,
    frozenUntil: card.frozenUntil ?? null,
    activatesAt: card.activatesAt ?? card.createdAt ?? 0,
    readyNotified: card.readyNotified ?? true,
    createdAt: card.createdAt ?? Date.now(),
  };
}

function readCards(address: string | null): StoredCard[] {
  if (!address) return EMPTY;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(keyFor(address));
  } catch {
    raw = null;
  }
  const cached = cache.get(address);
  if (cached && cached.raw === raw) return cached.value;
  let value: StoredCard[] = EMPTY;
  try {
    value = raw ? (JSON.parse(raw) as Partial<StoredCard>[]).map(normalizeCard) : EMPTY;
  } catch {
    value = EMPTY;
  }
  // Cap a stored list from any older shape.
  value = value.slice(0, MAX_CARDS);
  cache.set(address, { raw, value });
  return value;
}

function writeCards(address: string, next: StoredCard[]) {
  try {
    localStorage.setItem(keyFor(address), JSON.stringify(next));
  } catch {
    /* private mode */
  }
  emit();
}

/** Fires "your card is ready" once the activation window has passed. */
export function checkCardActivations(address: string) {
  const cards = readCards(address);
  const now = Date.now();
  let changed = false;
  const next = cards.map((card) => {
    if (!card.readyNotified && now >= card.activatesAt) {
      changed = true;
      addLocalNotification(address, {
        kind: "card_ready",
        title: "Your card is ready",
        body: `${card.name} •• ${card.number.slice(-4)} is now active and ready to use.`,
      });
      return { ...card, readyNotified: true };
    }
    return card;
  });
  if (changed) writeCards(address, next);
}

export function useCards(address: string | null) {
  const cards = useSyncExternalStore(
    subscribe,
    () => readCards(address),
    () => EMPTY,
  );
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const openCard = useCallback(
    (style: CardStyle, name: string, network: CardNetwork = "visa"): StoredCard | null => {
      if (!address || readCards(address).length >= MAX_CARDS) return null;
      const now = Date.now();
      const card: StoredCard = {
        id: crypto.randomUUID(),
        style,
        network,
        name,
        number: generateCardNumber(network),
        expiry: generateExpiry(),
        cvv: generateCvv(),
        frozen: false,
        frozenUntil: null,
        activatesAt: now + randomActivationDelay(),
        readyNotified: false,
        createdAt: now,
      };
      writeCards(address, [...readCards(address), card]);
      return card;
    },
    [address],
  );

  const freezeCard = useCallback(
    (id: string) => {
      if (!address) return;
      writeCards(
        address,
        readCards(address).map((c) =>
          c.id === id ? { ...c, frozen: true, frozenUntil: Date.now() + FREEZE_MIN_MS } : c,
        ),
      );
    },
    [address],
  );

  const unfreezeCard = useCallback(
    (id: string) => {
      if (!address) return;
      writeCards(
        address,
        readCards(address).map((c) =>
          c.id === id && canUnfreeze(c, Date.now())
            ? { ...c, frozen: false, frozenUntil: null }
            : c,
        ),
      );
    },
    [address],
  );

  const removeCard = useCallback(
    (id: string) => {
      if (!address) return;
      writeCards(address, readCards(address).filter((c) => c.id !== id));
    },
    [address],
  );

  return {
    cards,
    /** Convenience for single-card surfaces; prefer `cards`. */
    card: cards[0] ?? null,
    ready,
    canOpenMore: cards.length < MAX_CARDS,
    openCard,
    freezeCard,
    unfreezeCard,
    removeCard,
  };
}
