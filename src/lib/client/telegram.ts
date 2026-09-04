"use client";

/**
 * Telegram Mini App bridge.
 *
 * The official `telegram-web-app.js` script is loaded in the root layout;
 * inside Telegram it exposes `window.Telegram.WebApp`. Outside Telegram
 * the object either doesn't exist or reports platform "unknown", and all
 * of this becomes a no-op — the app keeps working as a normal web app.
 */

interface TelegramWebApp {
  platform: string;
  colorScheme: "light" | "dark";
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  disableVerticalSwipes?: () => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegram(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const wa = window.Telegram?.WebApp;
  if (!wa || wa.platform === "unknown") return null;
  return wa;
}

export const isTelegram = () => getTelegram() !== null;

/** Initialize the Mini App chrome. Safe to call repeatedly. */
export function initTelegram() {
  const wa = getTelegram();
  if (!wa) return false;
  try {
    wa.ready();
    wa.expand();
    // Match the MERIDIAN canvas so the Telegram chrome blends in
    const dark = document.documentElement.classList.contains("dark");
    wa.setHeaderColor(dark ? "#06162f" : "#f4efe4");
    wa.setBackgroundColor(dark ? "#06162f" : "#f4efe4");
    wa.disableVerticalSwipes?.();
  } catch {
    /* older Telegram clients miss some methods */
  }
  return true;
}

/** Light haptic tap where supported (no-op outside Telegram). */
export function haptic(style: "light" | "medium" | "heavy" = "light") {
  try {
    getTelegram()?.HapticFeedback?.impactOccurred(style);
  } catch {
    /* unsupported client */
  }
}
