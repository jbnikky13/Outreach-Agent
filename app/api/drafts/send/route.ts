import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireWorkspaceAccess } from "../../../../lib/server/workspace-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireWorkspaceAccess(request, ["owner", "admin", "member"]);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Never fall back to the legacy process-wide sender. Sending remains disabled
  // until the draft is bound to an owner-authorized, encrypted per-user mailbox.
  return NextResponse.json({ error: "Per-user mailbox connection and selection must be completed before sending is enabled." }, { status: 503 });

  try {
    const { prospectId, draftId } = await request.json();
    if (typeof prospectId !== "string" || typeof draftId !== "string") {
      return NextResponse.json({ error: "Prospect and draft IDs are required." }, { status: 400 });
    }

    const { supabase, user, workspaceId } = access.context;
    const [{ data: prospect, error: prospectError }, { data: draft, error: draftError }] = await Promise.all([
      supabase.from("prospects").select("id,email,name,owner_id,campaign_id")
        .eq("id", prospectId).eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("email_drafts").select("id,prospect_id,subject,body,status,approved_by,approved_content_hash,provider_message_id,send_attempted_at")
        .eq("id", draftId).eq("prospect_id", prospectId).eq("workspace_id", workspaceId).maybeSingle()
    ]);

    if (prospectError || !prospect) return NextResponse.json({ error: "Prospect not found in this workspace." }, { status: 404 });
    if (draftError || !draft) return NextResponse.json({ error: "Draft not found in this workspace." }, { status: 404 });
    if (!prospect.email) return NextResponse.json({ error: "Prospect has no email address." }, { status: 400 });
    if (draft.status !== "approved" || !draft.approved_by || !draft.approved_content_hash) {
      return NextResponse.json({ error: "This draft has no valid human approval." }, { status: 409 });
    }
    if (draft.provider_message_id) return NextResponse.json({ error: "This draft has already been sent." }, { status: 409 });

    const actualHash = createHash("sha256").update(JSON.stringify({ subject: draft.subject, body: draft.body })).digest("hex");
    if (actualHash !== draft.approved_content_hash) {
      return NextResponse.json({ error: "Draft content changed after approval. Review and approve it again." }, { status: 409 });
    }

    const { data: claimed, error: claimError } = await supabase.from("email_drafts")
      .update({ send_attempted_at: new Date().toISOString() })
      .eq("id", draftId).eq("workspace_id", workspaceId).eq("status", "approved")
      .is("provider_message_id", null).is("send_attempted_at", null)
      .select("id").maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ error: "This draft is already being sent or is no longer approved." }, { status: 409 });

    let result: { id: string; threadId?: string };
    try {
      result = await sendMail(prospect.email, draft.subject, draft.body);
    } catch (mailError) {
      // Provider/network failures can be ambiguous: the provider may have accepted
      // the message before the response was lost. Keep the claim locked and require
      // manual reconciliation rather than risking a duplicate email.
      console.error("email send outcome requires reconciliation", mailError);
      return NextResponse.json({
        success: false, pendingReconciliation: true,
        warning: "The send outcome could not be confirmed. Do not retry until the mailbox is checked and this attempt is reconciled.",
        draftId
      }, { status: 202 });
    }

    const sentAt = new Date().toISOString();
    const { data: markedSent, error: sentError } = await supabase.from("email_drafts").update({
      status: "sent", sent_at: sentAt, provider_message_id: result.id
    }).eq("id", draftId).eq("workspace_id", workspaceId).eq("status", "approved")
      .is("provider_message_id", null).select("id").maybeSingle();

    if (sentError || !markedSent) {
      return NextResponse.json({
        success: true,
        warning: "The provider accepted the email, but the local sent-state could not be confirmed. Do not resend until reconciled.",
        messageId: result.id, draftId
      }, { status: 202 });
    }

    await supabase.from("prospects").update({
      status: "sent", last_contacted_at: sentAt,
      next_follow_up_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    }).eq("id", prospectId).eq("workspace_id", workspaceId);

    await supabase.from("email_threads").insert({
      prospect_id: prospectId, workspace_id: workspaceId,
      provider: process.env.MAIL_PROVIDER, provider_message_id: result.id,
      provider_thread_id: result.threadId || null, last_message_at: sentAt,
      awaiting_reply: true, owner_id: prospect.owner_id ?? user.id
    });
    await supabase.from("activities").insert({
      campaign_id: prospect.campaign_id, prospect_id: prospectId,
      workspace_id: workspaceId, type: "email_sent", detail: draft.subject,
      owner_id: prospect.owner_id ?? user.id
    });
    await supabase.from("audit_logs").insert({
      workspace_id: workspaceId, actor_id: user.id, event_type: "draft.sent",
      entity_type: "email_draft", entity_id: draftId,
      metadata: { prospect_id: prospectId, provider_message_id: result.id }
    });

    return NextResponse.json({ success: true, messageId: result.id, threadId: result.threadId || null, draftId });
  } catch (error) {
    console.error("send draft error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email send failed." }, { status: 500 });
  }
}
