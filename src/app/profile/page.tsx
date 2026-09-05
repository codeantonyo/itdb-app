"use client";

import { useState } from "react";
import { Check, ChevronRight, Copy, LogOut, Moon, Plus, Sun, Trash2, Wallet } from "lucide-react";
import { AppBar } from "@/components/layout/app-bar";
import { Avatar } from "@/components/shared/avatar";
import { LedgerLine } from "@/components/shared/ledger-line";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { shortAddress, useAuth } from "@/lib/client/auth";
import { useTheme } from "@/lib/client/theme";
import { MAX_WALLETS } from "@/lib/itdb/config";
import { cn } from "@/lib/utils";

/** A tappable settings row. */
function Row({
  label,
  value,
  onClick,
  danger,
}: {
  label: string;
  value?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const body = (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className={cn("flex-1 text-[15.5px]", danger ? "text-danger" : "text-primary")}>{label}</span>
      {value && <span className="text-[14px] text-muted">{value}</span>}
      {onClick && <ChevronRight className="size-4 shrink-0 text-muted-2" />}
    </div>
  );
  return onClick ? (
    <button onClick={onClick} className="tap block w-full text-left transition-opacity active:opacity-70">
      {body}
    </button>
  ) : (
    body
  );
}

export default function ProfilePage() {
  const { session, signOut, updateSession, addWallet, removeWallet } = useAuth();
  const { theme, setTheme } = useTheme();
  const [sheet, setSheet] = useState<"none" | "edit" | "wallets" | "signout">("none");
  const [name, setName] = useState(session?.name ?? "");
  const [username, setUsername] = useState(session?.username ?? "");
  const [newWallet, setNewWallet] = useState("");
  const [walletError, setWalletError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!session) return null;

  const saveProfile = () => {
    updateSession({
      name: name.trim() || session.name,
      username: username.trim().toLowerCase() || session.username,
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setSheet("none");
    }, 900);
  };

  const submitWallet = () => {
    const problem = addWallet(newWallet.trim().toUpperCase());
    if (problem) {
      setWalletError(problem);
      return;
    }
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

  const memberSince = new Date(session.createdAt).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col">
      <AppBar title="Profile" />

      {/* ---------------- Identity ---------------- */}
      <section className="surface mt-1 flex items-center gap-4 p-5">
        <Avatar name={session.name} className="size-14 text-[18px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] font-semibold text-primary">{session.name}</p>
          <p className="truncate text-[13.5px] text-muted">@{session.username}</p>
          <p className="truncate text-[13px] text-muted-2">Member since {memberSince}</p>
        </div>
        {session.role === "admin" && (
          <span className="shrink-0 rounded-md bg-gold-soft px-2 py-1 text-[11px] font-bold text-gold">ADMIN</span>
        )}
      </section>

      {/* ---------------- Account ---------------- */}
      <p className="label mb-1.5 mt-5 px-1">Account</p>
      <div className="surface divide-y divide-hairline">
        <Row label="Email" value={session.email ?? "—"} />
        <Row label="Edit profile" onClick={() => setSheet("edit")} />
        <Row
          label="Wallets"
          value={`${session.wallets.length} of ${MAX_WALLETS}`}
          onClick={() => setSheet("wallets")}
        />
      </div>

      {/* ---------------- Referral ---------------- */}
      <p className="label mb-1.5 mt-5 px-1">Invite</p>
      <button onClick={copyReferral} className="surface tap flex w-full items-center gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-muted">Your referral code</span>
          <span className="font-display block text-[20px] font-semibold tracking-[0.08em] text-gold">
            {session.referralCode}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-muted">
          {copied ? (
            <>
              <Check className="size-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-4" /> Copy
            </>
          )}
        </span>
      </button>

      {/* ---------------- Appearance ---------------- */}
      <p className="label mb-1.5 mt-5 px-1">Appearance</p>
      <div className="surface grid grid-cols-2 gap-2 p-2">
        {(["dark", "light"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            className={cn(
              "tap flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors",
              theme === t ? "bg-gold-soft text-gold" : "text-muted",
            )}
          >
            {t === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            {t === "dark" ? "Navy" : "Parchment"}
          </button>
        ))}
      </div>

      <div className="surface mt-5">
        <Row label="Sign out" danger onClick={() => setSheet("signout")} />
      </div>

      <p className="mt-4 px-1 text-center text-[12.5px] text-muted-2">
        ITDB · International Tokenized Development Bank
      </p>

      {/* ---------------- Sheets ---------------- */}
      <Panel open={sheet === "edit"} title="Edit profile" onClose={() => setSheet("none")}>
        <div className="flex flex-col gap-4">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <Field
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="off"
            spellCheck={false}
          />
          <Button size="lg" onClick={saveProfile}>
            {saved ? "Saved" : "Save changes"}
          </Button>
        </div>
      </Panel>

      <Panel open={sheet === "wallets"} title="Linked wallets" onClose={() => setSheet("none")}>
        <p className="text-[14.5px] leading-relaxed text-muted">
          Read-only. Holdings across all wallets count toward your tiers and airdrop eligibility.
        </p>
        <div className="mt-3">
          {session.wallets.map((w, i) => (
            <LedgerLine
              key={w}
              label={
                <span className="flex items-center gap-2">
                  <Wallet className="size-4 shrink-0 text-muted-2" />
                  {i === 0 ? "Primary" : `Wallet ${i + 1}`}
                </span>
              }
              value={shortAddress(w)}
              valueClassName="font-medium"
              mark={
                i > 0 ? (
                  <button
                    onClick={() => removeWallet(w)}
                    aria-label="Remove wallet"
                    className="tap -mr-2 flex items-center justify-center px-2 text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
        {session.wallets.length < MAX_WALLETS ? (
          <div className="mt-4 flex items-end gap-2">
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
        ) : (
          <p className="mt-4 text-[14px] text-muted">
            All {MAX_WALLETS} slots are in use. Remove one to link a different address.
          </p>
        )}
        {walletError && <p className="mt-2 text-[13.5px] text-danger">{walletError}</p>}
      </Panel>

      <Panel open={sheet === "signout"} title="Sign out?" onClose={() => setSheet("none")}>
        <p className="text-[15px] leading-relaxed text-muted">
          You&apos;ll need your email and password to sign back in. Your holdings and cards are unaffected.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={() => setSheet("none")}>
            Stay
          </Button>
          <Button variant="danger" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </Panel>
    </div>
  );
}
