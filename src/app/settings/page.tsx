"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, LogOut, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { shortAddress, STELLAR_ADDRESS_RE, useAuth } from "@/lib/client/auth";
import { useTheme } from "@/lib/client/theme";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { session, signOut, updateSession, addWallet, removeWallet } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(session?.name ?? "");
  const [username, setUsername] = useState(session?.username ?? "");
  const [newWallet, setNewWallet] = useState("");
  const [walletError, setWalletError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!session) return null;

  const saveProfile = () => {
    updateSession({ name: name.trim() || session.name, username: username.trim().toLowerCase() || session.username });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const submitWallet = () => {
    const addr = newWallet.trim().toUpperCase();
    if (!STELLAR_ADDRESS_RE.test(addr)) {
      setWalletError("A Stellar address starts with G and has 56 characters.");
      return;
    }
    addWallet(addr);
    setNewWallet("");
    setWalletError(null);
  };

  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(session.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        subtitle={session.email ?? undefined}
        trailing={
          <Link href="/" aria-label="Back" className="tap card flex items-center justify-center rounded-full text-primary">
            <ArrowLeft className="size-5" />
          </Link>
        }
      />

      <section className="flex flex-col gap-3">
        <SectionHeader title="Profile" />
        <div className="card flex flex-col gap-4 p-4">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="off" spellCheck={false} />
          <Button variant="outline" onClick={saveProfile}>
            {saved ? <><Check className="size-4" /> Saved</> : "Save changes"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Appearance" />
        <div className="card grid grid-cols-2 gap-2 p-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn("tap flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors", theme === t ? "bg-gold-soft text-gold" : "text-muted")}
            >
              {t === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              {t === "dark" ? "Navy" : "Parchment"}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Wallets" note="read-only" />
        <div className="card divide-y divide-hairline">
          {session.wallets.map((w, i) => (
            <div key={w} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div>
                <p className="tnum text-[15px] font-semibold text-primary">{shortAddress(w)}</p>
                <p className="text-[13px] text-muted">{i === 0 ? "Primary wallet" : "Linked wallet"}</p>
              </div>
              {i > 0 && (
                <button onClick={() => removeWallet(w)} aria-label="Remove wallet" className="tap flex items-center justify-center rounded-full bg-danger-soft text-danger">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          <div className="p-3">
            <div className="flex items-end gap-2">
              <Field
                className="flex-1"
                label="Add a wallet"
                placeholder="G…"
                value={newWallet}
                onChange={(e) => {
                  setNewWallet(e.target.value);
                  setWalletError(null);
                }}
                spellCheck={false}
                autoCapitalize="characters"
              />
              <Button variant="outline" size="md" onClick={submitWallet} aria-label="Add wallet" className="h-[54px]">
                <Plus className="size-4" />
              </Button>
            </div>
            {walletError && <p className="mt-2 text-[13.5px] text-danger">{walletError}</p>}
            <p className="mt-2 text-[13px] text-muted-2">Holdings across all wallets count toward your tiers.</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Your referral code" />
        <button onClick={copyReferral} className="card tap flex items-center justify-between px-4 py-3.5 text-left">
          <span className="font-display text-[20px] font-semibold tracking-[0.1em] text-gold">{session.referralCode}</span>
          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-muted">
            {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy</>}
          </span>
        </button>
      </section>

      <Button variant="danger" size="lg" onClick={signOut}>
        <LogOut className="size-4" />
        Sign out
      </Button>
    </div>
  );
}
