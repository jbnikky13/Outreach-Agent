import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireWorkspaceAccess } from "../../../../lib/server/workspace-auth";
import { getFreshMailboxAccessToken, sendThroughMailbox, verifyMailboxIdentity } from "../../../../lib/server/mailbox-send";
import { safeProvider } from "../../../../lib/server/mailbox-oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireWorkspaceAccess(request, ["owner", "admin", "member"]);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const { prospectId, draftId } = await request.json();
    if (typeof prospectId !== "string" || typeof draftId !== "string") {
      return NextResponse.json({ error: "Prospect and draft IDs are required." }, { status: 400 });
    }
    const { supabase, user, workspaceId } = access.context;
    const [{ data: prospect, error: prospectError }, { data: draft, error: draftError }] = await Promise.all([
      supabase.from("prospects").select("id,email,name,owner_id,campaign_id")
        .eq("id", prospectId).eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("email_drafts")
        .select("id,prospect_id,subject,body,status,approved_by,approved_content_hash,provider_message_id,send_attempted_at,mailbox_id,created_by")
        .eq("id", draftId).eq("prospect_id", prospectId).eq("workspace_id", workspaceId).maybeSingle()
    ]);
    if (prospectError || !prospect) return NextResponse.json({ error: "Prospect not found in this workspace." }, { status: 404 });
    if (draftError || !draft) return NextResponse.json({ error: "Draft not found in this workspace." }, { status: 404 });
    if (!prospect.email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(prospect.email)) {
      return NextResponse.json({ error: "Prospect has no valid email address." }, { status: 400 });
    }
    if (draft.status !== "approved" || !draft.approved_by || !draft.approved_content_hash) {
      return NextResponse.json({ error: "This draft has no valid human approval." }, { status: 409 });
    }
    if (draft.provider_message_id) return NextResponse.json({ error: "This draft has already been sent." }, { status: 409 });
    if (!draft.mailbox_id || !draft.created_by || draft.created_by !== user.id) {
      return NextResponse.json({ error: "Only the draft creator can send from the mailbox bound to this draft." }, { status: 403 });
    }

    const actualHash = createHash("sha256").update(JSON.stringify({ subject: draft.subject, body: draft.body })).digest("hex");
    if (actualHash !== draft.approved_content_hash) {
      return NextResponse.json({ error: "Draft content changed after approval. Review and approve it again." }, { status: 409 });
    }
    if (!draft.subject?.trim() || /[\r\n]/.test(draft.subject) || !draft.body?.trim()) {
      return NextResponse.json({ error: "Draft content is invalid." }, { status: 400 });
    }

    // Sending remains opt-in and disabled in Preview until provider credentials,
    // test accounts, and end-to-end checks are completed.
    if (process.env.MAIL_SEND_ENABLED !== "true") {
      return NextResponse.json({ error: "Email sending is disabled in this environment." }, { status: 503 });
    }

    const { data: mailbox } = await supabase.from("mailboxes")
      .select("id,provider,email,provider_inbox_id,active,revoked_at,connected_by")
      .eq("id", draft.mailbox_id).eq("workspace_id", workspaceId)
      .eq("connected_by", user.id).eq("active", true).is("revoked_at", null).maybeSingle();
    if (!mailbox || !safeProvider(mailbox.provider)) {
      return NextResponse.json({ error: "The mailbox bound to this draft is no longer available. Reconnect or create a new draft." }, { status: 409 });
    }
    const { data: credential, error: credentialError } = await supabase.from("mailbox_credentials")
      .select("mailbox_id,workspace_id,user_id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at")
      .eq("mailbox_id", mailbox.id).eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
    if (credentialError || !credential) {
      return NextResponse.json({ error: "Encrypted mailbox credentials are unavailable. Reconnect your mailbox." }, { status: 409 });
    }

    // Refresh credentials before claiming the send attempt. Token refresh cannot
    // create an email and therefore must not consume the one-shot send claim.
    let accessToken: string;
    try {
      accessToken = await getFreshMailboxAccessToken(supabase, mailbox.provider, credential);
    } catch (error) {
      console.error("mailbox token refresh failed", error);
      return NextResponse.json({ error: "Mailbox authorization needs attention. Reconnect the selected account before sending." }, { status: 409 });
    }

    try {
      await verifyMailboxIdentity(mailbox.provider, accessToken, mailbox.provider_inbox_id, mailbox.email);
    } catch (error) {
      console.error("mailbox identity verification failed", error);
      return NextResponse.json({ error: "The provider account no longer matches your selected mailbox. Reconnect before sending." }, { status: 409 });
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
      result = await sendThroughMailbox(mailbox.provider, accessToken, prospect.email, draft.subject, draft.body);
    } catch (mailError) {
      // A timeout or provider error may occur after acceptance. Keep the claim
      // locked; never automatically retry and risk sending a duplicate.
      console.error("email send outcome requires reconciliation", mailError);
      return NextResponse.json({
        success: false, pendingReconciliation: true,
        warning: "The send outcome could not be confirmed. Check the selected mailbox before taking any further action.",
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
        success: true, warning: "The provider accepted the email, but the local sent-state could not be confirmed. Do not resend until reconciled.",
        messageId: result.id, draftId
      }, { status: 202 });
    }

    await supabase.from("prospects").update({
      status: "sent", last_contacted_at: sentAt,
      next_follow_up_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    }).eq("id", prospectId).eq("workspace_id", workspaceId);
    await supabase.from("email_threads").insert({
      prospect_id: prospectId, workspace_id: workspaceId, provider: mailbox.provider,
      provider_message_id: result.id, provider_thread_id: result.threadId || null,
      last_message_at: sentAt, awaiting_reply: true, owner_id: user.id
    });
    await supabase.from("activities").insert({
      campaign_id: prospect.campaign_id, prospect_id: prospectId,
      workspace_id: workspaceId, type: "email_sent", detail: draft.subject, owner_id: user.id
    });
    await supabase.from("audit_logs").insert({
      workspace_id: workspaceId, actor_id: user.id, event_type: "draft.sent",
      entity_type: "email_draft", entity_id: draftId,
      metadata: { prospect_id: prospectId, provider: mailbox.provider, mailbox_id: mailbox.id, provider_message_id: result.id }
    });
    return NextResponse.json({ success: true, messageId: result.id, threadId: result.threadId || null, draftId });
  } catch (error) {
    console.error("send draft error", error);
    return NextResponse.json({ error: "Email send failed." }, { status: 500 });
  }
}
