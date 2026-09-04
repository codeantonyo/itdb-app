import { createHmac } from "crypto";
import { getDb } from "./db";

/**
 * Telegram Mini App `initData` validation (per Telegram's spec): the
 * data-check string is HMAC-signed with a secret derived from the bot
 * token, so a valid hash proves the payload really came from Telegram
 * for OUR bot. Requires TELEGRAM_BOT_TOKEN; without it this always
 * returns null and Telegram auto-login is simply off.
 */
export function telegramUserId(initData: string): number | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!botToken || !initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (expected !== hash) return null;

  // Reject stale payloads (Telegram signs a timestamp into initData)
  const authDate = Number(params.get("auth_date") ?? 0) * 1000;
  if (!authDate || Date.now() - authDate > 24 * 60 * 60 * 1000) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "") as { id?: number };
    return typeof user?.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Push notifications                                                 */
/* ------------------------------------------------------------------ */

/**
 * Send a message to one Telegram chat. Fire-and-forget by design:
 * notifications must NEVER break the action that triggered them.
 */
export async function sendTelegramMessage(chatId: number, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!botToken || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.warn(`[telegram] sendMessage ${res.status} for chat ${chatId}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[telegram] sendMessage failed", e);
    return false;
  }
}

/**
 * Notify an ITDB account by id. No-op when the account has never opened
 * the Mini App. Always call as `void notifyAccount(...)`.
 */
export async function notifyAccount(accountId: string, text: string): Promise<boolean> {
  try {
    const db = await getDb();
    const account = db.accounts.find((a) => a.id === accountId);
    if (!account?.telegramId) return false;
    return await sendTelegramMessage(account.telegramId, text);
  } catch {
    return false;
  }
}
