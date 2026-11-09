import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type WorkspaceRole = "owner" | "admin" | "member" | "reviewer";

export type AuthorizedWorkspace = {
  supabase: SupabaseClient;
  user: User;
  workspaceId: string;
  role: WorkspaceRole;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/**
 * Validates the caller's Supabase access token, then resolves workspace
 * membership from the database. Never trust a workspace ID or role supplied
 * by the browser or Telegram client.
 *
 * This helper is intended for server routes after the workspace migration
 * has been applied and verified in a non-production environment.
 */
export async function requireWorkspaceAccess(
  request: Request,
  allowedRoles: WorkspaceRole[] = ["owner", "admin", "member", "reviewer"]
): Promise<
  | { ok: true; context: AuthorizedWorkspace }
  | { ok: false; status: 401 | 403; error: string }
> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, error: "Sign in is required." };
  }

  const supabase = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: authData, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !authData.user) {
    return { ok: false, status: 401, error: "Your session is invalid or expired." };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id,role")
    .eq("user_id", authData.user.id);

  if (membershipError) {
    console.error("workspace membership lookup failed", membershipError);
    return { ok: false, status: 403, error: "Workspace access could not be verified." };
  }

  const eligible = (memberships ?? []).filter(
    (membership) => allowedRoles.includes(membership.role as WorkspaceRole)
  );

  if (eligible.length === 0) {
    return { ok: false, status: 403, error: "You do not have permission to perform this action." };
  }

  // Until workspace switching is implemented, a user with multiple
  // memberships must select a workspace explicitly in a later API contract.
  if (eligible.length > 1) {
    return { ok: false, status: 403, error: "Select an active workspace before continuing." };
  }

  return {
    ok: true,
    context: {
      supabase,
      user: authData.user,
      workspaceId: eligible[0].workspace_id,
      role: eligible[0].role as WorkspaceRole
    }
  };
}
