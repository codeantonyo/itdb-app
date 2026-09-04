"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  capturePendingReferral,
  isAutoLoginSuppressed,
  useAuth,
  type AccountPayload,
} from "@/lib/client/auth";
import { checkCardActivations } from "@/lib/client/cards";
import { pullState, pushState, resetSyncCache } from "@/lib/client/state-sync";
import { getTelegram, initTelegram } from "@/lib/client/telegram";
import { BottomNav } from "./bottom-nav";
import { MeridianBackground } from "./meridian-background";
import { SplashScreen } from "./splash-screen";

/** Routes accessible without a session */
const PUBLIC_ROUTES = new Set(["/login"]);

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, ready, signIn, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.has(pathname);

  // A referral deep link may land on any route — capture ?ref= before
  // any redirect strips it, so sign-up can pre-fill the code.
  useEffect(() => {
    capturePendingReferral();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session && !isPublic) router.replace("/login");
    if (session && isPublic) router.replace("/");
  }, [ready, session, isPublic, router]);

  // Telegram Mini App persistence: once an account is linked to this
  // Telegram user, every open signs in automatically — and a signed-in
  // session links itself so the NEXT open needs no password either.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      if (!session && isAutoLoginSuppressed()) return;
      let wa = getTelegram();
      for (let i = 0; i < 10 && !wa; i++) {
        await new Promise((r) => setTimeout(r, 300));
        if (cancelled) return;
        wa = getTelegram();
      }
      if (!wa?.initData) {
        if (session) {
          try {
            const res = await fetch("/api/auth/session");
            const { accountId } = (await res.json()) as { accountId: string | null };
            if (!cancelled && accountId !== session.accountId) signOut();
          } catch {
            /* offline — leave the session alone */
          }
        }
        return;
      }
      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: wa.initData }),
        });
        const data = (await res.json()) as { ok?: boolean; account?: AccountPayload };
        if (cancelled) return;
        if (data.account) {
          if (!session || session.accountId !== data.account.id) signIn(data.account);
        } else if (session) {
          const who = await fetch("/api/auth/session");
          const { accountId } = (await who.json()) as { accountId: string | null };
          if (!cancelled && accountId !== session.accountId) signOut();
        }
      } catch {
        /* offline — try again next open */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, session, signIn, signOut]);

  // Durable state sync: restore this account's data from the server on
  // login (survives cookie clears / new devices), then keep it backed up.
  useEffect(() => {
    if (!session) return;
    const accountId = session.accountId;
    let stopped = false;

    resetSyncCache();
    (async () => {
      const hydrated = await pullState(accountId);
      if (stopped) return;
      if (hydrated) {
        window.location.reload();
        return;
      }
    })();

    const push = () => pushState(accountId);
    const interval = setInterval(push, 180_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") pushState(accountId, { keepalive: true });
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
      pushState(accountId, { keepalive: true });
    };
  }, [session]);

  // Card activation watcher — fires "your card is ready"
  useEffect(() => {
    if (!session) return;
    queueMicrotask(() => checkCardActivations(session.address));
    const id = setInterval(() => checkCardActivations(session.address), 5000);
    return () => clearInterval(id);
  }, [session]);

  if (!ready || (!session && !isPublic) || (session && isPublic)) {
    return null;
  }

  return (
    <>
      <div
        className={
          session
            ? "mx-auto min-h-dvh w-full max-w-[460px] px-5 pb-[calc(96px+var(--safe-bottom))]"
            : "mx-auto min-h-dvh w-full max-w-[460px]"
        }
      >
        {children}
      </div>
      {session && <BottomNav />}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready } = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // The splash stays up for a beat even on instant loads — an opening
  // ceremony, not a spinner.
  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Telegram Mini App bootstrap (no-op in normal browsers)
  useEffect(() => {
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      if (initTelegram() || attempts >= 10) clearInterval(id);
    }, 300);
    return () => clearInterval(id);
  }, []);

  const showSplash = !ready || !minTimeElapsed;

  // Unmount on a timer after the fade — never wait on an animation.
  const [splashGone, setSplashGone] = useState(false);
  useEffect(() => {
    if (showSplash) return;
    const t = setTimeout(() => setSplashGone(true), 700);
    return () => clearTimeout(t);
  }, [showSplash]);

  return (
    <>
      <MeridianBackground />
      {!splashGone && <SplashScreen leaving={!showSplash} />}
      <AuthGate>{children}</AuthGate>
    </>
  );
}
