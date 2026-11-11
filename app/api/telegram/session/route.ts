import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { validateTelegramWebAppInitData } from "../../../../lib/server/telegram-webapp-auth";

export const runtime = "nodejs";

const SESSION_COOKIE = "oa_telegram_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

function reject(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const appOrigin = new URL(required("APP_BASE_URL")).origin;
    if (!origin || new URL(origin).origin !== appOrigin) {
      return reject("Request origin is not allowed.", 403);
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 12_000) return reject("Request body is too large.", 413);

    const body = await request.json().catch(() => null) as { initData?: unknown } | null;
    if (!body || typeof body.initData !== "string") {
      return reject("Telegram authentication data is required.", 400);
    }

    const identity = validateTelegramWebAppInitData(body.initData, required("TELEGRAM_BOT_TOKEN"));
    const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: account, error: accountError } = await supabase
      .from("telegram_accounts")
      .select("user_id,workspace_id")
      .eq("telegram_user_id", identity.telegramUserId)
      .maybeSingle();

    if (accountError || !account) {
      return reject("Your Telegram account is not linked to an Outreach Agent workspace. Contact your workspace administrator.", 403);
    }

    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", account.workspace_id)
      .eq("user_id", account.user_id)
      .maybeSingle();

    if (membershipError || !membership || !["owner", "admin", "member", "reviewer"].includes(membership.role)) {
      return reject("Your workspace membership is unavailable. Contact your workspace administrator.", 403);
    }

    const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(account.user_id);
    if (authUserError || !authUser.user) return reject("The linked Outreach Agent account is unavailable.", 403);

    const rawSessionToken = randomBytes(32).toString("base64url");
    const sessionHash = createHash("sha256").update(rawSessionToken).digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

    const { error: insertError } = await supabase.from("telegram_web_sessions").insert({
      session_hash: sessionHash,
      init_data_hash: identity.initDataHash,
      telegram_user_id: identity.telegramUserId,
      user_id: account.user_id,
      workspace_id: account.workspace_id,
      expires_at: expiresAt
    });

    if (insertError) {
      // A unique init_data_hash prevents the same signed launch payload from
      // being exchanged more than once. A fresh Mini App launch is required.
      console.warn("Telegram session exchange rejected", insertError.code);
      return reject("This Telegram launch has already been used. Close and reopen the Mini App.", 409);
    }

    const response = NextResponse.json({
      authenticated: true,
      workspaceId: account.workspace_id,
      role: membership.role,
      expiresAt
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: rawSessionToken,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Telegram Mini App session exchange failed", error);
    return reject("Could not authenticate this Telegram session.", 500);
  }
}
