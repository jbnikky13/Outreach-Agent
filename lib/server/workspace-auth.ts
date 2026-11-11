import { createHash } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type WorkspaceRole = "owner" | "admin" | "member" | "reviewer";
export type AuthorizedWorkspace = { supabase: SupabaseClient; user: User; workspaceId: string; role: WorkspaceRole };

const TELEGRAM_SESSION_COOKIE = "oa_telegram_session";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try { return decodeURIComponent(raw); } catch { return null; }
  }
  return null;
}

/**
 * Authenticates either the existing Supabase bearer session (website) or the
 * server-issued HttpOnly Telegram session (Mini App), then independently
 * verifies workspace membership and role on every request.
 */
export async function requireWorkspaceAccess(
  request: Request,
  allowedRoles: WorkspaceRole[] = ["owner", "admin", "member", "reviewer"]
): Promise<{ ok: true; context: AuthorizedWorkspace } | { ok: false; status: 400 | 401 | 403; error: string }> {
  const bearerToken = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
  const telegramToken = bearerToken ? null : cookieValue(request, TELEGRAM_SESSION_COOKIE);
  if (!bearerToken && !telegramToken) return { ok: false, status: 401, error: "Sign in is required." };

  const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let user: User;
  let workspaceId: string;
  if (bearerToken) {
    const selectedWorkspace = request.headers.get("x-workspace-id");
    if (!selectedWorkspace || !/^[0-9a-f-]{36}$/i.test(selectedWorkspace)) {
      return { ok: false, status: 400, error: "An active workspace must be selected." };
    }
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (error || !data.user) return { ok: false, status: 401, error: "Your session is invalid or expired." };
    user = data.user;
    workspaceId = selectedWorkspace;
  } else {
    if (!telegramToken || telegramToken.length < 32 || telegramToken.length > 128) {
      return { ok: false, status: 401, error: "Your Telegram session is invalid or expired." };
    }
    const sessionHash = createHash("sha256").update(telegramToken).digest("hex");
    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await supabase
      .from("telegram_web_sessions")
      .select("id,user_id,workspace_id")
      .eq("session_hash", sessionHash)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .maybeSingle();
    if (sessionError || !session) return { ok: false, status: 401, error: "Your Telegram session is invalid or expired. Reopen the Mini App." };

    const selectedWorkspace = request.headers.get("x-workspace-id");
    if (selectedWorkspace && selectedWorkspace !== session.workspace_id) {
      return { ok: false, status: 403, error: "The requested workspace does not match your Telegram session." };
    }

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(session.user_id);
    if (authError || !authData.user) return { ok: false, status: 401, error: "The linked account is no longer available." };
    user = authData.user;
    workspaceId = session.workspace_id;
    await supabase.from("telegram_web_sessions").update({ last_used_at: now }).eq("id", session.id);
  }

  const { data: membership, error } = await supabase
    .from("workspace_members").select("workspace_id,role")
    .eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();

  if (error) {
    console.error("workspace membership lookup failed", error);
    return { ok: false, status: 403, error: "Workspace access could not be verified." };
  }
  if (!membership || !allowedRoles.includes(membership.role as WorkspaceRole)) {
    return { ok: false, status: 403, error: "You do not have permission to perform this action." };
  }
  return { ok: true, context: { supabase, user, workspaceId, role: membership.role as WorkspaceRole } };
}

/** Authenticate a Supabase bearer token without requiring a workspace header (invite acceptance). */
export async function authenticateBearerUser(
  request: Request
): Promise<{ ok: true; supabase: SupabaseClient; user: User } | { ok: false; status: 401; error: string }> {
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { ok: false, status: 401, error: "Sign in is required." };
  const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: "Your session is invalid or expired." };
  return { ok: true, supabase, user: data.user };
}
