import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireWorkspaceAccess } from "../../../../lib/server/workspace-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireWorkspaceAccess(request, ["owner", "admin", "member"]);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const { draftId, prospectId } = await request.json();
    if (typeof draftId !== "string" || typeof prospectId !== "string") {
      return NextResponse.json({ error: "Draft and prospect IDs are required." }, { status: 400 });
    }

    const { supabase, user, workspaceId } = access.context;
    const { data: draft, error: readError } = await supabase.from("email_drafts")
      .select("id,prospect_id,subject,body,status,provider_message_id")
      .eq("id", draftId).eq("prospect_id", prospectId).eq("workspace_id", workspaceId).maybeSingle();

    if (readError || !draft) return NextResponse.json({ error: "Draft not found in this workspace." }, { status: 404 });
    if (draft.status !== "pending" || draft.provider_message_id) {
      return NextResponse.json({ error: "Only an unsent pending draft can be approved." }, { status: 409 });
    }
    if (!draft.subject?.trim() || !draft.body?.trim()) return NextResponse.json({ error: "Draft content is incomplete." }, { status: 400 });

    const hash = createHash("sha256").update(JSON.stringify({ subject: draft.subject, body: draft.body })).digest("hex");
    const { data: approved, error } = await supabase.from("email_drafts").update({
      status: "approved", approved_at: new Date().toISOString(),
      approved_by: user.id, approved_content_hash: hash
    }).eq("id", draftId).eq("workspace_id", workspaceId).eq("status", "pending")
      .is("provider_message_id", null).select("id,subject,body,status,approved_at").maybeSingle();

    if (error || !approved) return NextResponse.json({ error: "Draft changed or was approved by another request. Refresh and review it again." }, { status: 409 });
    await supabase.from("prospects").update({ status: "ready" }).eq("id", prospectId).eq("workspace_id", workspaceId);
    await supabase.from("audit_logs").insert({
      workspace_id: workspaceId, actor_id: user.id, event_type: "draft.approved",
      entity_type: "email_draft", entity_id: draftId,
      metadata: { content_hash: hash, prospect_id: prospectId }
    });
    return NextResponse.json({ success: true, draft: approved });
  } catch (error) {
    console.error("draft approval failed", error);
    return NextResponse.json({ error: "Approval failed." }, { status: 500 });
  }
}
