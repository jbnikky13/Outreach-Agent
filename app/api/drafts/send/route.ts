import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMail } from "../../../../lib/mail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { prospectId, subject, body, campaignId, draftId } = await request.json();
    if (!prospectId || !subject || !body || !draftId) {
      return NextResponse.json({ error: "Prospect, draft, subject and body are required." }, { status: 400 });
    }

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: prospect, error: prospectError } = await supabase
      .from("prospects")
      .select("id,email,name,owner_id,campaign_id")
      .eq("id", prospectId)
      .single();

    if (prospectError || !prospect) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });

    const { data: draft, error: draftError } = await supabase
      .from("email_drafts")
      .select("id,status,provider_message_id")
      .eq("id", draftId)
      .eq("prospect_id", prospectId)
      .single();

    if (draftError || !draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    if (draft.status !== "approved") return NextResponse.json({ error: `Draft is ${draft.status}; it must be approved before sending.` }, { status: 409 });
    if (draft.provider_message_id) return NextResponse.json({ error: "This draft has already been sent." }, { status: 409 });

    const attemptAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("email_drafts")
      .update({ send_attempted_at: attemptAt })
      .eq("id", draftId)
      .eq("prospect_id", prospectId)
      .eq("status", "approved")
      .is("provider_message_id", null)
      .or("send_attempted_at.is.null,send_attempted_at.lt." + new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .select("id")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ error: "This draft is already being sent or is no longer approved." }, { status: 409 });

    let result: { id: string; threadId?: string };
    try {
      result = await sendMail(prospect.email, subject, body);
    } catch (mailError) {
      await supabase.from("email_drafts").update({ send_attempted_at: null }).eq("id", draftId).eq("status", "approved").is("provider_message_id", null);
      throw mailError;
    }
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("email_drafts")
      .update({ subject, body, status: "sent", sent_at: now, provider_message_id: result.id })
      .eq("id", draftId)
      .eq("status", "sending")
      .is("provider_message_id", null);

    if (updateError) {
      return NextResponse.json({
        success: true,
        warning: "Gmail accepted the message, but the local sent-state could not be saved. Do not resend until the draft is reconciled.",
        messageId: result.id,
        threadId: result.threadId || null,
        draftId,
      }, { status: 202 });
    }

    await supabase
      .from("prospects")
      .update({ status: "sent", last_contacted_at: now, next_follow_up_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() })
      .eq("id", prospectId);

    await supabase.from("email_threads").insert({
      prospect_id: prospectId,
      provider: process.env.MAIL_PROVIDER,
      provider_message_id: result.id,
      provider_thread_id: result.threadId || null,
      last_message_at: now,
      awaiting_reply: true,
      owner_id: prospect.owner_id,
    });

    await supabase.from("activities").insert({
      campaign_id: prospect.campaign_id || campaignId || null,
      prospect_id: prospectId,
      type: "email_sent",
      detail: subject,
      owner_id: prospect.owner_id,
    });

    return NextResponse.json({ success: true, messageId: result.id, threadId: result.threadId || null, draftId });
  } catch (error: any) {
    console.error("send draft error", error);
    const message = error instanceof Error ? error.message : (typeof error === "string" ? error : (() => { try { return JSON.stringify(error); } catch { return "Unknown error"; } })());
    const tokenMatch = message.match(/Gmail token refresh failed \\((\\d+)\\):\\s*([\\s\\S]*)$/);
    const sendMatch = message.match(/Gmail send failed \\((\\d+)\\):\\s*([\\s\\S]*)$/);
    const profileMatch = message.match(/authorized Gmail mailbox \\((\\d+)\\):\\s*([\\s\\S]*)$/);
    const match = tokenMatch || sendMatch || profileMatch;
    const stage = tokenMatch ? "oauth_token" : sendMatch ? "gmail_send" : profileMatch ? "gmail_profile" : message.includes("Draft") || message.includes("prospect") ? "validation" : "server";
    let providerStatus = match ? Number(match[1]) : null;
    let raw = match?.[2] || message;
    let provider: any = null;
    try { provider = JSON.parse(raw); } catch { provider = { raw }; }
    return NextResponse.json({ error: "Email send failed.", diagnostic: { stage, providerStatus, reason: provider?.error?.errors?.[0]?.reason ?? provider?.error?.status ?? null, message: typeof (provider?.error?.message ?? provider?.error_description ?? provider?.raw ?? message) === "string" ? (provider?.error?.message ?? provider?.error_description ?? provider?.raw ?? message) : JSON.stringify(provider?.error?.message ?? provider?.error_description ?? provider?.raw ?? message) } }, { status: 500 });
  }
}
