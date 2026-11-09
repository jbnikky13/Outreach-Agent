import { NextResponse } from "next/server";
import { createDraftApprovalHash } from "../../../../lib/server/draft-approval";
import { isValidEmailAddress } from "../../../../lib/server/email-validation";
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
    const [{ data: draft, error: readError }, { data: prospect, error: prospectError }] = await Promise.all([
      supabase.from("email_drafts")
        .select("id,prospect_id,subject,body,status,provider_message_id,mailbox_id")
        .eq("id", draftId).eq("prospect_id", prospectId).eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("prospects").select("id,email")
        .eq("id", prospectId).eq("workspace_id", workspaceId).maybeSingle()
    ]);

    if (readError || !draft) return NextResponse.json({ error: "Draft not found in this workspace." }, { status: 404 });
    if (prospectError || !prospect) return NextResponse.json({ error: "Prospect not found in this workspace." }, { status: 404 });
    if (draft.status !== "pending" || draft.provider_message_id) {
      return NextResponse.json({ error: "Only an unsent pending draft can be approved." }, { status: 409 });
    }
    if (!draft.subject?.trim() || !draft.body?.trim()) return NextResponse.json({ error: "Draft content is incomplete." }, { status: 400 });
    if (!draft.mailbox_id) return NextResponse.json({ error: "This draft has no member-owned mailbox binding. Generate a new draft after selecting your mailbox." }, { status: 409 });
    if (!isValidEmailAddress(prospect.email)) {
      return NextResponse.json({ error: "The prospect must have a valid email address before approval." }, { status: 400 });
    }

    // Approval binds the exact message, recipient, and sender mailbox.
    // Any later recipient/content/mailbox change makes the send-time hash fail.
    const hash = createDraftApprovalHash({
      subject: draft.subject,
      body: draft.body,
      recipient: prospect.email,
      mailboxId: draft.mailbox_id
    });
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
      metadata: { content_hash: hash, prospect_id: prospectId, recipient: prospect.email.trim().toLowerCase(), mailbox_id: draft.mailbox_id }
    });
    return NextResponse.json({ success: true, draft: approved });
  } catch (error) {
    console.error("draft approval failed", error);
    return NextResponse.json({ error: "Approval failed." }, { status: 500 });
  }
}
