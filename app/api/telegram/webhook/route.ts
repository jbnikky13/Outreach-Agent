import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    text?: string;
    from?: { id?: number };
    chat?: { id?: number; type?: string };
  };
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function reply(chatId: number, text: string) {
  const token = required("TELEGRAM_BOT_TOKEN");
  const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!response.ok) throw new Error("Telegram sendMessage failed: " + response.status);
}

export async function POST(request: Request) {
  try {
    const expectedSecret = required("TELEGRAM_WEBHOOK_SECRET");
    if (expectedSecret.length < 32) throw new Error("TELEGRAM_WEBHOOK_SECRET must be at least 32 characters");
    const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!safeEqual(suppliedSecret, expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
    }

    const update = await request.json() as TelegramUpdate;
    const message = update.message;
    const chatId = message?.chat?.id;
    const telegramUserId = message?.from?.id;
    const text = message?.text?.trim() ?? "";
    if (!message || typeof chatId !== "number" || typeof telegramUserId !== "number") {
      return NextResponse.json({ ok: true });
    }
    if (message.chat?.type !== "private") {
      await reply(chatId, "For account security, link and use Outreach Agent in a private chat with this bot.");
      return NextResponse.json({ ok: true });
    }

    if (/^\/start(?:\s|$)/i.test(text)) {
      await reply(chatId, "Welcome to Outreach Agent. To link your account, sign in to the web app, generate a Telegram link code, then send /link YOUR_CODE here. Link codes expire after 10 minutes and can only be used once.");
      return NextResponse.json({ ok: true });
    }

    const match = text.match(/^\/link(?:@\w+)?\s+([A-Za-z0-9_-]{24,128})$/i);
    if (!match) {
      await reply(chatId, "I can link your account with a one-time code. Generate it in Outreach Agent, then send /link YOUR_CODE.");
      return NextResponse.json({ ok: true });
    }

    const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const codeHash = createHash("sha256").update(match[1]).digest("hex");
    const { error } = await supabase.rpc("redeem_telegram_link_code", {
      p_code_hash: codeHash,
      p_telegram_user_id: telegramUserId,
      p_telegram_chat_id: chatId
    });

    if (error) {
      await reply(chatId, "That link code is invalid, expired, already used, or your Telegram account is already linked. Generate a fresh code in Outreach Agent.");
      return NextResponse.json({ ok: true });
    }

    await reply(chatId, "Your Telegram account is now securely linked to your Outreach Agent workspace. You can return to the web app to continue.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
