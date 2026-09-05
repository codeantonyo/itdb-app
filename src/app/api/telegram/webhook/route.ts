import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/server/telegram";

/**
 * Telegram bot webhook for @itdbapp_bot.
 *
 * Answers /start with the bank's name, a short description and a button
 * that opens the Mini App. Register it once with Telegram:
 *
 *   https://api.telegram.org/bot<TOKEN>/setWebhook
 *     ?url=https://itdb-app.vercel.app/api/telegram/webhook
 *     &secret_token=<TELEGRAM_WEBHOOK_SECRET>
 *
 * The secret is echoed back by Telegram in a header on every update, so
 * setting it stops anyone else posting fake updates at this endpoint.
 */

/** The Mini App deep link. Telegram routes this to the app inside the client. */
const MINI_APP_URL = process.env.TELEGRAM_MINI_APP_URL ?? "https://t.me/itdbapp_bot/ITDBAPP";

const WELCOME =
  "🏛 <b>ITDB</b>\n" +
  "<i>International Tokenized Development Bank</i>\n\n" +
  "A consumer bank built on the Stellar network. Hold ITDB, ITDBONE and QRS in one account and see " +
  "everything priced live from the Stellar exchange.\n\n" +
  "• <b>Reserve baskets</b> — nine positions that scale with your ITDB tier\n" +
  "• <b>Daily yield</b> — on ITDBONE and QRS, counted from the day you bought\n" +
  "• <b>Founding airdrop</b> — for members holding all three assets\n" +
  "• <b>Cards</b> — up to three, Visa or Mastercard, funded by your balance\n\n" +
  "Tap below to open the app.";

const HELP = "Send /start to open ITDB.";

interface TelegramUpdate {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
}

/** Inline keyboard with a single button that opens the Mini App. */
const openAppKeyboard = {
  inline_keyboard: [[{ text: "🏛  Open ITDB", url: MINI_APP_URL }]],
};

async function reply(chatId: number, text: string, withButton: boolean): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!botToken) {
    console.warn("[telegram] webhook hit but TELEGRAM_BOT_TOKEN is not set");
    return;
  }
  if (!withButton) {
    await sendTelegramMessage(chatId, text);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: openAppKeyboard,
      }),
    });
    if (!res.ok) console.warn(`[telegram] sendMessage ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.warn("[telegram] sendMessage failed", e);
  }
}

export async function POST(req: Request) {
  // Reject forged updates when a secret is configured.
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    if (req.headers.get("x-telegram-bot-api-secret-token") !== expected) {
      return NextResponse.json({ error: "Forbidden" }, { status: 401 });
    }
  } else {
    console.warn("[telegram] TELEGRAM_WEBHOOK_SECRET is unset — updates are not verified");
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    // Malformed body: acknowledge so Telegram stops retrying it.
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  if (!chatId) return NextResponse.json({ ok: true });

  // /start may arrive as "/start", "/start PAYLOAD" or "/start@itdbapp_bot".
  const isStart = /^\/start(@\w+)?(\s|$)/i.test(text);
  await reply(chatId, isStart ? WELCOME : HELP, isStart);

  // Always 200: a non-2xx makes Telegram retry the same update.
  return NextResponse.json({ ok: true });
}

/** A GET is handy for confirming the route is deployed. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    bot: "@itdbapp_bot",
    miniApp: MINI_APP_URL,
    secretConfigured: !!process.env.TELEGRAM_WEBHOOK_SECRET,
    tokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
  });
}
