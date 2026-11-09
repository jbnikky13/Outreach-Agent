import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { requireWorkspaceAccess } from "../../../../../lib/server/workspace-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireWorkspaceAccess(request, ["owner", "admin", "member", "reviewer"]);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const { supabase, user, workspaceId } = access.context;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const code = randomBytes(24).toString("base64url");
    const codeHash = createHash("sha256").update(code).digest("hex");

    await supabase.from("telegram_link_codes").update({ consumed_at: now.toISOString() })
      .eq("workspace_id", workspaceId).eq("user_id", user.id).is("consumed_at", null);

    const { error } = await supabase.from("telegram_link_codes").insert({
      workspace_id: workspaceId, user_id: user.id, code_hash: codeHash, expires_at: expiresAt
    });
    if (error) {
      console.error("Telegram link code insert failed", error);
      return NextResponse.json({ error: "Could not create a Telegram link code." }, { status: 500 });
    }
    return NextResponse.json({ code, expiresAt, instruction: "Send /link followed by this code to the official Outreach Agent Telegram bot. The code expires in 10 minutes." });
  } catch (error) {
    console.error("Telegram link code creation failed", error);
    return NextResponse.json({ error: "Telegram link code creation failed." }, { status: 500 });
  }
}
