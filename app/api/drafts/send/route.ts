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
    if (draft.status !== "approved") return NextResponse.json({ error: "Draft must be approved before sending." }, { status: 409 });
    if (draft.provider_message_id) return NextResponse.json({ error: "This draft has already been sent." }, { status: 409 });

    const result = await sendMail(prospect.email, subject, body);
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("email_drafts")
      .update({ subject, body, status: "sent", sent_at: now, provider_message_id: result.id })
      .eq("id", draftId)
      .eq("status", "approved")
      .is("provider_message_id", null);

    if (updateError) throw updateError;

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
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email send failed." }, { status: 500 });
  }
}
