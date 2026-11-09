import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { requireWorkspaceAccess } from "../../../../lib/server/workspace-auth";

export const runtime = "nodejs";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

export async function POST(request: Request) {
  const access = await requireWorkspaceAccess(request, ["owner", "admin"]);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid invitation email is required." }, { status: 400 });
    }
    if (!["admin", "member", "reviewer"].includes(role)) {
      return NextResponse.json({ error: "Role must be admin, member, or reviewer." }, { status: 400 });
    }

    const { supabase, user, workspaceId } = access.context;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const redirect = new URL("/accept-invite", required("APP_BASE_URL"));
    redirect.searchParams.set("token", token);

    const { data: invitation, error: insertError } = await supabase.from("workspace_invitations").insert({
      workspace_id: workspaceId, invited_email: email, role, token_hash: tokenHash,
      created_by: user.id, expires_at: expiresAt
    }).select("id").single();
    if (insertError || !invitation) {
      console.error("workspace invitation insert failed", insertError);
      return NextResponse.json({ error: "Could not create invitation." }, { status: 500 });
    }

    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirect.toString()
    });
    if (emailError) {
      await supabase.from("workspace_invitations").update({ revoked_at: new Date().toISOString() })
        .eq("id", invitation.id).eq("workspace_id", workspaceId);
      console.error("Supabase invitation email failed", emailError);
      return NextResponse.json({ error: "Invitation was not emailed. Check Supabase email configuration and try again." }, { status: 502 });
    }

    return NextResponse.json({ success: true, email, role, expiresAt });
  } catch (error) {
    console.error("create workspace invitation failed", error);
    return NextResponse.json({ error: "Invitation creation failed. Check APP_BASE_URL and Supabase email configuration." }, { status: 500 });
  }
}
