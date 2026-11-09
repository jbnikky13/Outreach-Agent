import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type WorkspaceRole = "owner" | "admin" | "member" | "reviewer";
export type AuthorizedWorkspace = { supabase: SupabaseClient; user: User; workspaceId: string; role: WorkspaceRole };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/** Authenticate the bearer token and verify membership in the explicitly selected workspace. */
export async function requireWorkspaceAccess(
  request: Request,
  allowedRoles: WorkspaceRole[] = ["owner", "admin", "member", "reviewer"]
): Promise<{ ok: true; context: AuthorizedWorkspace } | { ok: false; status: 401 | 403; error: string }> {
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { ok: false, status: 401, error: "Sign in is required." };

  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    return { ok: false, status: 400 as 403, error: "An active workspace must be selected." };
  }

  const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return { ok: false, status: 401, error: "Your session is invalid or expired." };

  const { data: membership, error } = await supabase
    .from("workspace_members").select("workspace_id,role")
    .eq("workspace_id", workspaceId).eq("user_id", authData.user.id).maybeSingle();

  if (error) {
    console.error("workspace membership lookup failed", error);
    return { ok: false, status: 403, error: "Workspace access could not be verified." };
  }
  if (!membership || !allowedRoles.includes(membership.role as WorkspaceRole)) {
    return { ok: false, status: 403, error: "You do not have permission to perform this action." };
  }
  return { ok: true, context: { supabase, user: authData.user, workspaceId, role: membership.role as WorkspaceRole } };
}
