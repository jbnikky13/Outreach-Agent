import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { authenticateBearerUser } from "../../../../../lib/server/workspace-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateBearerUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.user.email) return NextResponse.json({ error: "Your account does not have a verified email address." }, { status: 403 });

  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token.length < 32 || token.length > 256) {
      return NextResponse.json({ error: "A valid invitation token is required." }, { status: 400 });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data: workspaceId, error } = await auth.supabase.rpc("accept_workspace_invitation", {
      p_token_hash: tokenHash,
      p_user_id: auth.user.id,
      p_user_email: auth.user.email
    });
    if (error || !workspaceId) {
      return NextResponse.json({ error: "Invitation could not be accepted. It may be expired, revoked, already used, or addressed to another email." }, { status: 409 });
    }
    return NextResponse.json({ success: true, workspaceId });
  } catch (error) {
    console.error("accept workspace invitation failed", error);
    return NextResponse.json({ error: "Invitation acceptance failed." }, { status: 500 });
  }
}
