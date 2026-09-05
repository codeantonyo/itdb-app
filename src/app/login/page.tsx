"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, Check, Landmark, Lock, MailCheck, ShieldCheck, Wallet } from "lucide-react";
import { ItdbMark } from "@/components/brand/logo";
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

const connectSteps = ["Verifying your wallet on Stellar", "Securing your account", "Loading your balances"];

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
    <p className="rise mt-4 rounded-xl bg-danger-soft px-4 py-3 text-[14.5px] leading-relaxed text-danger">{error}</p>
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

/** Standard app bar: back on the left, title centred. */
function AppBar({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 -mx-6 flex h-14 items-center gap-2 bg-canvas px-6 pt-[var(--safe-top)]">
      <button onClick={onBack} aria-label="Back" className="tap -ml-3 flex items-center justify-center text-primary">
        <ArrowLeft className="size-[22px]" />
      </button>
      <h1 className="flex-1 text-center text-[16px] font-semibold text-primary">{title}</h1>
      <div className="flex min-w-[22px] justify-end">{action}</div>
    </div>
  );
}

/** A numbered section of the application form. */
function FormSection({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-4">
      <h2 className="flex items-center gap-2.5 text-[15px] font-semibold text-primary">
        <span className="flex size-7 items-center justify-center rounded-full bg-gold text-[13px] font-bold text-gold-ink">
          {step}
        </span>
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
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
      // Verify the wallet on-chain, but only BLOCK on a definitive
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
      const reg = await postJson<{ pendingVerification?: boolean; devCode?: string; error?: string }>(
        "/api/auth/register",
        {
          name: name.trim(),
          email: email.trim(),
          password,
          address: trimmed,
          referredBy: referral.trim() || null,
        },
      );
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
      const res = await postJson<{ account?: AccountPayload; error?: string }>("/api/auth/verify-email", {
        email: otpEmail,
        code: otpCode,
      });
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
      const res = await postJson<{ ok?: boolean; devCode?: string; error?: string }>("/api/auth/request-otp", {
        purpose,
        email: targetEmail,
      });
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
      const res = await postJson<{ ok?: boolean; devCode?: string; error?: string }>("/api/auth/request-otp", {
        purpose: "reset",
        email: resetEmail.trim(),
      });
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

  /* ---------------- Cover: navy hero above a raised form sheet ------- */
  if (phase === "cover") {
    return (
      <div className="flex min-h-dvh flex-col">
        <div className="panel-navy engrave relative flex flex-1 flex-col items-center justify-center rounded-none border-0 px-8 pb-16 pt-[calc(48px+var(--safe-top))] text-center">
          <div className="flex size-[86px] items-center justify-center rounded-[26px] border border-[rgba(212,160,23,0.5)] bg-white/5">
            <ItdbMark className="size-14" />
          </div>
          <p className="font-display mt-6 text-[30px] font-semibold tracking-[0.2em] text-primary">ITDB</p>
          <p className="mt-1.5 text-[11.5px] uppercase tracking-[0.18em] text-muted-2">
            International Tokenized Development Bank
          </p>
          <h1 className="font-display mt-8 text-[26px] font-semibold leading-snug text-primary">
            Your reserve assets,
            <br />
            held like a bank account.
          </h1>
          <p className="mt-3 max-w-[300px] text-[15px] leading-relaxed text-muted">
            ITDB, ITDBONE and QRS in one place, priced live from the Stellar network.
          </p>
        </div>

        <div className="-mt-6 rounded-t-[28px] border-t border-hairline-gold bg-canvas px-6 pb-[max(28px,var(--safe-bottom))] pt-7">
          <div className="mb-5 flex justify-center gap-6">
            {[
              { icon: Landmark, label: "Tiered reserves" },
              { icon: Wallet, label: "Read-only wallets" },
              { icon: Lock, label: "Keys stay yours" },
            ].map((f) => (
              <span key={f.label} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                <f.icon className="size-[19px] text-gold" strokeWidth={1.9} />
                <span className="text-[11.5px] leading-tight text-muted">{f.label}</span>
              </span>
            ))}
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
      </div>
    );
  }

  /* ---------------- Connecting ---------------- */
  if (phase === "connecting") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6">
        <div className="flex size-[72px] items-center justify-center rounded-[22px] border border-hairline-gold bg-gold-soft">
          <ItdbMark className="size-11" />
        </div>
        <h1 className="font-display mt-6 text-[22px] font-semibold text-primary">Setting up your account</h1>
        <div className="mt-7 flex w-full max-w-[320px] flex-col gap-3">
          {connectSteps.map((label, i) => {
            const done = doneSteps > i;
            const active = doneSteps === i;
            return (
              <div key={label} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-500",
                    done ? "border-gold bg-gold text-gold-ink" : active ? "border-gold text-gold" : "border-hairline text-muted-2",
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : <span className="text-[11px] font-bold">{i + 1}</span>}
                </span>
                <p className={cn("text-[15px]", done || active ? "text-primary" : "text-muted-2")}>{label}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------------- Form screens ---------------- */
  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[max(24px,var(--safe-bottom))]">
      {phase === "register" && (
        <>
          <AppBar title="Open an account" onBack={() => go("cover")} />
          <div className="rise flex flex-1 flex-col pt-2">
            <p className="pb-4 text-[14.5px] leading-relaxed text-muted">
              Three short steps. We&apos;ll email you a code to confirm your address at the end.
            </p>
            <div className="flex flex-col gap-3">
              <FormSection step={1} title="About you">
                <Field label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                <Field label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  hint="At least 8 characters."
                />
              </FormSection>
              <FormSection step={2} title="Your Stellar wallet">
                <Field
                  label="Wallet address"
                  placeholder="G…"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="characters"
                  autoComplete="off"
                  hint="Read-only. Starts with G, 56 characters. Your keys never leave your wallet."
                />
              </FormSection>
              <FormSection step={3} title="Referral code">
                <Field
                  label="Optional"
                  placeholder="ITDB-A1B2C3"
                  value={referral}
                  onChange={(e) => setReferral(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </FormSection>
            </div>
            <ErrorLine error={error} />
            <div className="mt-6 flex flex-col items-center gap-3">
              <Button size="lg" onClick={register}>
                Create my account
              </Button>
              <p className="flex items-center gap-1.5 text-[12.5px] text-muted-2">
                <ShieldCheck className="size-3.5" />
                Passwords are salted and hashed.
              </p>
            </div>
          </div>
        </>
      )}

      {phase === "signin" && (
        <>
          <AppBar
            title="Sign in"
            onBack={() => go("cover")}
            action={
              <button onClick={() => go("register")} className="tap text-[14px] font-semibold text-gold">
                Join
              </button>
            }
          />
          <div className="rise flex flex-1 flex-col pt-4">
            <div className="flex flex-col gap-4">
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
              className="tap mt-1 self-end text-[14px] font-semibold text-gold"
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
        </>
      )}

      {phase === "otp" && (
        <>
          <AppBar title="Confirm your email" onBack={() => go("register")} />
          <div className="rise flex flex-1 flex-col pt-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-gold-soft text-gold">
              <MailCheck className="size-7" strokeWidth={1.8} />
            </span>
            <h2 className="font-display mt-4 text-[24px] font-semibold text-primary">Check your email</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              We sent a 6-digit code to <span className="font-semibold text-primary">{otpEmail}</span>.
            </p>
            <div className="mt-6">
              <OtpInput value={otpCode} onChange={setOtpCode} />
            </div>
            <DevCodeNotice code={devCode} />
            <ErrorLine error={error} />
            <div className="mt-auto flex flex-col items-center gap-3 pt-8">
              <Button size="lg" onClick={submitOtp} disabled={busy}>
                {busy ? "Verifying…" : "Activate my account"}
              </Button>
              <button onClick={() => resendOtp("signup", otpEmail)} disabled={busy} className="tap text-[14px] font-semibold text-gold">
                Resend code
              </button>
            </div>
          </div>
        </>
      )}

      {phase === "forgot" && (
        <>
          <AppBar title="Reset password" onBack={() => go("signin")} />
          <div className="rise flex flex-1 flex-col pt-4">
            <h2 className="font-display text-[24px] font-semibold text-primary">Forgot your password?</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Enter your account email and we&apos;ll send you a reset code.
            </p>
            <div className="mt-6">
              <Field label="Email address" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} autoComplete="email" />
            </div>
            <ErrorLine error={error} />
            <div className="mt-auto pt-8">
              <Button size="lg" onClick={startForgot} disabled={busy}>
                {busy ? "Sending…" : "Send reset code"}
              </Button>
            </div>
          </div>
        </>
      )}

      {phase === "reset" && (
        <>
          <AppBar title="Reset password" onBack={() => go("forgot")} />
          <div className="rise flex flex-1 flex-col pt-4">
            <h2 className="font-display text-[24px] font-semibold text-primary">Choose a new password</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Enter the code we sent to <span className="font-semibold text-primary">{resetEmail.trim()}</span>.
            </p>
            <div className="mt-6 flex flex-col gap-5">
              <OtpInput value={otpCode} onChange={setOtpCode} />
              <PasswordField
                label="New password"
                value={resetPassword}
                onChange={setResetPassword}
                autoComplete="new-password"
                hint="At least 8 characters."
              />
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
        </>
      )}
    </div>
  );
}
