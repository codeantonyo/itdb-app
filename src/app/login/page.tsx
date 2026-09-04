"use client";

import { useCallback, useState } from "react";
import { ItdbMark, ItdbWordmark } from "@/components/brand/logo";
import { LedgerLine } from "@/components/shared/ledger-line";
import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";
import {
  clearPendingReferral,
  pendingReferral,
  STELLAR_ADDRESS_RE,
  useAuth,
  type AccountPayload,
} from "@/lib/client/auth";
import { REFERRAL_RE } from "@/lib/referral";
import type { AccountResponse } from "@/lib/stellar/types";
import { cn } from "@/lib/utils";

type Phase = "cover" | "register" | "signin" | "otp" | "forgot" | "reset" | "connecting";

const connectSteps = ["Verifying wallet on Stellar", "Securing your account", "Preparing your ledger"];

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="rise mt-4 rounded-xl bg-danger-soft px-4 py-3 text-[14.5px] leading-relaxed text-danger">
      {error}
    </p>
  );
}

/** Shown while no email provider is configured (BREVO_API_KEY unset). */
function DevCodeNotice({ code }: { code: string | null }) {
  if (!code) return null;
  return (
    <p className="mt-4 rounded-xl border border-hairline-gold bg-gold-soft px-4 py-3 text-[14px] leading-relaxed text-muted">
      <span className="font-semibold text-gold">Dev mode</span> — no email service configured. Your code:{" "}
      <span className="tnum font-bold tracking-[0.2em] text-primary">{code}</span>
    </p>
  );
}

/** Numbered form section. */
function FormSection({ numeral, title, children }: { numeral: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2.5 text-[15px] font-semibold text-primary">
        <span className="flex size-7 items-center justify-center rounded-full bg-gold-soft text-[12.5px] font-bold text-gold">{numeral}</span>
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function TopBar({ onBack, right }: { onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center justify-between">
      {onBack ? (
        <button onClick={onBack} className="tap -ml-2 px-2 text-[14px] font-semibold text-muted">
          ← Back
        </button>
      ) : (
        <ItdbWordmark className="text-primary" />
      )}
      {right}
    </div>
  );
}

export default function LoginPage() {
  const { signIn } = useAuth();

  const [phase, setPhase] = useState<Phase>("cover");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [address, setAddress] = useState("");
  const [referral, setReferral] = useState(() => pendingReferral());
  const [error, setError] = useState<string | null>(null);
  const [doneSteps, setDoneSteps] = useState(0);

  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const go = (p: Phase) => {
    setError(null);
    setPhase(p);
  };

  const enterOtp = (targetEmail: string, code: string | null) => {
    setOtpEmail(targetEmail);
    setOtpCode("");
    setDevCode(code);
    go("otp");
  };

  const finishSignIn = useCallback(
    async (account: AccountPayload) => {
      setPhase("connecting");
      setDoneSteps(1);
      fetch(`/api/account/${account.wallets[0]}`).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      setDoneSteps(2);
      fetch("/api/tokens").catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      setDoneSteps(3);
      await new Promise((r) => setTimeout(r, 600));
      clearPendingReferral();
      signIn(account);
    },
    [signIn],
  );

  const register = async () => {
    if (name.trim().length < 2) return setError("Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Please enter a valid email address.");
    if (password.length < 8) return setError("Passwords need at least 8 characters.");
    const trimmed = address.trim().toUpperCase();
    if (!STELLAR_ADDRESS_RE.test(trimmed)) return setError("A Stellar address starts with G and has 56 characters.");
    if (referral.trim() && !REFERRAL_RE.test(referral.trim())) return setError("Referral codes look like ITDB-A1B2C3.");

    setError(null);
    setPhase("connecting");
    setDoneSteps(0);
    const fail = (message: string) => {
      setPhase("register");
      setError(message);
    };
    try {
      // Verify the wallet on-chain — but only BLOCK on a definitive
      // "not funded". If Horizon is busy we proceed anyway.
      try {
        const chainRes = await fetch(`/api/account/${trimmed}`);
        if (chainRes.ok) {
          const chain = (await chainRes.json()) as AccountResponse;
          if (!chain.exists)
            return fail("This wallet isn't active on the Stellar network yet. Fund it with XLM first, then try again.");
        }
      } catch {
        /* Horizon unreachable — don't block registration on it */
      }
      setDoneSteps(1);
      const reg = await postJson<{ pendingVerification?: boolean; devCode?: string; error?: string }>("/api/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
        address: trimmed,
        referredBy: referral.trim() || null,
      });
      if (!reg.data.pendingVerification) return fail(reg.data.error ?? "Registration failed. Please try again.");
      enterOtp(email.trim().toLowerCase(), reg.data.devCode ?? null);
    } catch {
      fail("Something went wrong. Please try again.");
    }
  };

  const login = async () => {
    if (identifier.trim().length < 3) return setError("Enter your email or username.");
    if (password.length < 1) return setError("Enter your password.");
    setError(null);
    setBusy(true);
    try {
      const res = await postJson<{
        account?: AccountPayload;
        error?: string;
        needsVerification?: boolean;
        email?: string;
        devCode?: string;
      }>("/api/auth/login", { identifier: identifier.trim(), password });
      if (res.data.needsVerification && res.data.email) {
        enterOtp(res.data.email, res.data.devCode ?? null);
        return;
      }
      if (!res.data.account) return setError(res.data.error ?? "Sign-in failed. Please try again.");
      await finishSignIn(res.data.account);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    if (!/^\d{6}$/.test(otpCode)) return setError("Enter the 6-digit code from your email.");
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ account?: AccountPayload; error?: string }>("/api/auth/verify-email", { email: otpEmail, code: otpCode });
      if (!res.data.account) return setError(res.data.error ?? "Verification failed.");
      await finishSignIn(res.data.account);
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async (purpose: "signup" | "reset", targetEmail: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ ok?: boolean; devCode?: string; error?: string }>("/api/auth/request-otp", { purpose, email: targetEmail });
      if (!res.data.ok) setError(res.data.error ?? "Couldn't send the code.");
      else setDevCode(res.data.devCode ?? null);
    } finally {
      setBusy(false);
    }
  };

  const startForgot = async () => {
    if (!/^\S+@\S+\.\S+$/.test(resetEmail.trim())) return setError("Enter the email you signed up with.");
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ ok?: boolean; devCode?: string; error?: string }>("/api/auth/request-otp", { purpose: "reset", email: resetEmail.trim() });
      if (!res.data.ok) return setError(res.data.error ?? "Couldn't send the code.");
      setDevCode(res.data.devCode ?? null);
      setOtpCode("");
      go("reset");
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    if (!/^\d{6}$/.test(otpCode)) return setError("Enter the 6-digit code from your email.");
    if (resetPassword.length < 8) return setError("Passwords need at least 8 characters.");
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ account?: AccountPayload; error?: string }>("/api/auth/reset-password", {
        email: resetEmail.trim(),
        code: otpCode,
        newPassword: resetPassword,
      });
      if (!res.data.account) return setError(res.data.error ?? "Reset failed.");
      await finishSignIn(res.data.account);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col px-6 pb-[max(28px,var(--safe-bottom))] pt-[calc(16px+var(--safe-top))]">
      {/* ============================ COVER ============================ */}
      {phase === "cover" && (
        <div key="cover" className="rise flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="hero guilloche flex size-28 items-center justify-center rounded-[32px]">
              <ItdbMark className="size-16" />
            </div>
            <h1 className="font-display mt-8 text-[32px] font-semibold leading-tight text-primary">
              Banking on Stellar,
              <br />
              built like an institution.
            </h1>
            <p className="mt-4 max-w-[320px] text-[16px] leading-relaxed text-muted">
              ITDB, ITDBONE and QRS in one account, priced live from the Stellar DEX, with one card per member.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <Button size="lg" onClick={() => go("register")}>
              Open an account
            </Button>
            <Button size="lg" variant="outline" onClick={() => go("signin")}>
              Sign in
            </Button>
          </div>
        </div>
      )}

      {/* ========================== REGISTER ========================== */}
      {phase === "register" && (
        <div key="register" className="rise flex flex-1 flex-col">
          <TopBar
            onBack={() => go("cover")}
            right={
              <button onClick={() => go("signin")} className="tap text-[14px] font-semibold text-gold">
                Sign in instead
              </button>
            }
          />
          <h1 className="font-display mt-5 text-[30px] font-semibold leading-none text-primary">Create your account</h1>
          <p className="mt-2.5 text-[15px] text-muted">Three quick steps. We confirm your email with a code at the end.</p>

          <div className="mt-6 flex flex-col gap-3">
            <FormSection numeral="1" title="About you">
              <Field label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <Field label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                hint="At least 8 characters. You'll sign in with email or username and password."
              />
            </FormSection>
            <FormSection numeral="2" title="Your Stellar wallet">
              <Field
                label="Wallet address"
                placeholder="G…"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                spellCheck={false}
                autoCapitalize="characters"
                autoComplete="off"
                hint="Read-only — your keys never leave your wallet. Starts with G, 56 characters; we verify it on the network."
              />
            </FormSection>
            <FormSection numeral="3" title="Referral code (optional)">
              <Field
                label="Referral code"
                placeholder="ITDB-A1B2C3 (optional)"
                value={referral}
                onChange={(e) => setReferral(e.target.value)}
                spellCheck={false}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </FormSection>
          </div>

          <ErrorLine error={error} />

          <div className="mt-8 flex flex-col items-center gap-3">
            <Button size="lg" onClick={register}>
              Create my account
            </Button>
            <p className="text-[12.5px] text-muted-2">Passwords are salted and hashed.</p>
          </div>
        </div>
      )}

      {/* =========================== SIGN IN ========================== */}
      {phase === "signin" && (
        <div key="signin" className="rise flex flex-1 flex-col">
          <TopBar
            onBack={() => go("cover")}
            right={
              <button onClick={() => go("register")} className="tap text-[14px] font-semibold text-gold">
                Open an account
              </button>
            }
          />
          <h1 className="font-display mt-5 text-[30px] font-semibold leading-none text-primary">Welcome back</h1>
          <p className="mt-2.5 text-[15px] text-muted">Sign in with your email or username and password.</p>
          <div className="mt-8 flex flex-col gap-5">
            <Field
              label="Email or username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="off"
            />
            <PasswordField label="Password" value={password} onChange={setPassword} />
          </div>
          <button
            onClick={() => {
              setResetEmail(identifier.includes("@") ? identifier.trim() : "");
              go("forgot");
            }}
            className="tap mt-2 self-end text-[14px] font-semibold text-gold"
          >
            Forgot password?
          </button>
          <ErrorLine error={error} />
          <div className="mt-auto pt-8">
            <Button size="lg" onClick={login} disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </div>
      )}

      {/* ============================= OTP ============================ */}
      {phase === "otp" && (
        <div key="otp" className="rise flex flex-1 flex-col">
          <TopBar onBack={() => go("register")} />
          <h1 className="font-display mt-6 text-[30px] font-semibold leading-none text-primary">Check your email</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
            We sent a 6-digit code to <span className="font-semibold text-primary">{otpEmail}</span>. Enter it to activate your account.
          </p>
          <div className="mt-8">
            <OtpInput value={otpCode} onChange={setOtpCode} />
          </div>
          <DevCodeNotice code={devCode} />
          <ErrorLine error={error} />
          <div className="mt-auto flex flex-col items-center gap-3 pt-8">
            <Button size="lg" onClick={submitOtp} disabled={busy}>
              {busy ? "Verifying…" : "Activate account"}
            </Button>
            <button onClick={() => resendOtp("signup", otpEmail)} disabled={busy} className="tap text-[14px] font-semibold text-gold">
              Resend code
            </button>
          </div>
        </div>
      )}

      {/* ============================ FORGOT ========================== */}
      {phase === "forgot" && (
        <div key="forgot" className="rise flex flex-1 flex-col">
          <TopBar onBack={() => go("signin")} />
          <h1 className="font-display mt-6 text-[30px] font-semibold leading-none text-primary">Forgot your password?</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-muted">Enter your account email and we&apos;ll send you a reset code.</p>
          <div className="mt-8">
            <Field label="Email address" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} autoComplete="email" />
          </div>
          <ErrorLine error={error} />
          <div className="mt-auto pt-8">
            <Button size="lg" onClick={startForgot} disabled={busy}>
              {busy ? "Sending…" : "Send reset code"}
            </Button>
          </div>
        </div>
      )}

      {/* ============================= RESET ========================== */}
      {phase === "reset" && (
        <div key="reset" className="rise flex flex-1 flex-col">
          <TopBar onBack={() => go("forgot")} />
          <h1 className="font-display mt-6 text-[30px] font-semibold leading-none text-primary">Reset your password</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
            Enter the code we sent to <span className="font-semibold text-primary">{resetEmail.trim()}</span> and choose a new password.
          </p>
          <div className="mt-8 flex flex-col gap-6">
            <OtpInput value={otpCode} onChange={setOtpCode} />
            <PasswordField label="New password" value={resetPassword} onChange={setResetPassword} autoComplete="new-password" hint="At least 8 characters." />
          </div>
          <DevCodeNotice code={devCode} />
          <ErrorLine error={error} />
          <div className="mt-auto flex flex-col items-center gap-3 pt-8">
            <Button size="lg" onClick={submitReset} disabled={busy}>
              {busy ? "Resetting…" : "Reset and sign in"}
            </Button>
            <button onClick={() => resendOtp("reset", resetEmail.trim())} disabled={busy} className="tap text-[14px] font-semibold text-gold">
              Resend code
            </button>
          </div>
        </div>
      )}

      {/* ========================== CONNECTING ======================== */}
      {phase === "connecting" && (
        <div key="connecting" className="rise flex flex-1 flex-col items-center justify-center">
          <div className="card w-full max-w-[340px] px-5 py-6">
            <p className="font-display text-[20px] font-semibold text-primary">Setting things up</p>
            <div className="mt-3">
              {connectSteps.map((label, i) => {
                const done = doneSteps > i;
                const active = doneSteps === i;
                return (
                  <LedgerLine
                    key={label}
                    label={label}
                    labelClassName={cn(done || active ? "text-primary" : "text-muted-2")}
                    value={done ? "✓" : active ? "…" : ""}
                    valueClassName={cn(done ? "text-gold" : "text-muted-2")}
                  />
                );
              })}
            </div>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-elevated"><div className="shimmer h-full w-full" /></div>
          </div>
        </div>
      )}
    </div>
  );
}
