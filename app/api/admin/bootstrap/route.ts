import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

function safeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  try {
    const bootstrapSecret = required("WORKSPACE_BOOTSTRAP_SECRET");
    if (bootstrapSecret.length < 32) {
      return NextResponse.json({ error: "Workspace bootstrap is not securely configured." }, { status: 503 });
    }
    const suppliedSecret = request.headers.get("x-workspace-bootstrap-secret") ?? "";
    if (!safeEqual(suppliedSecret, bootstrapSecret)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const workspaceName = typeof body.workspaceName === "string"
      ? body.workspaceName.trim().slice(0, 120)
      : "Outreach Agent Workspace";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid first-owner email is required." }, { status: 400 });
    }

    const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Invite the first owner through Supabase Auth. No password is generated
    // or exposed; the owner establishes access through the verified email link.
    const redirectTo = new URL("/", required("APP_BASE_URL")).toString();
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo
    });
    if (inviteError || !inviteData.user) {
      console.error("first-owner auth invitation failed", inviteError);
      return NextResponse.json({
        error: "Could not invite the first owner. The email may already have an Auth account, or Supabase email delivery may not be configured."
      }, { status: 409 });
    }

    const { data: workspaceId, error: bootstrapError } = await supabase.rpc("bootstrap_first_workspace", {
      p_user_id: inviteData.user.id,
      p_workspace_name: workspaceName
    });
    if (bootstrapError || !workspaceId) {
      // Best-effort compensation: remove only the Auth user created by this
      // request, so a failed one-time bootstrap does not leave an orphan.
      const { error: cleanupError } = await supabase.auth.admin.deleteUser(inviteData.user.id);
      if (cleanupError) console.error("first-owner bootstrap compensation failed", cleanupError);
      console.error("first-owner workspace bootstrap failed", bootstrapError);
      return NextResponse.json({
        error: "The first workspace could not be created. No workspace was activated; check server logs before retrying."
      }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      email,
      workspaceId,
      message: "First-owner invitation sent. The owner must verify the email before signing in."
    });
  } catch (error) {
    console.error("first-owner bootstrap failed", error);
    return NextResponse.json({ error: "First-owner bootstrap is not configured correctly." }, { status: 503 });
  }
}
