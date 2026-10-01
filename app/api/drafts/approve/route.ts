import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { draftId, prospectId, subject, body } = await request.json();
    if (!draftId || !prospectId || !subject || !body) {
      return NextResponse.json({ error: "Draft, prospect, subject and body are required." }, { status: 400 });
    }

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from("email_drafts")
      .update({ subject, body, status: "approved", approved_at: new Date().toISOString() })
      .eq("id", draftId)
      .eq("prospect_id", prospectId)
      .eq("status", "pending")
      .is("provider_message_id", null)
      .select("id,subject,body,status")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Pending draft not found." }, { status: 404 });
    }

    await supabase.from("prospects").update({ status: "ready" }).eq("id", prospectId);

    return NextResponse.json({ success: true, draft: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval failed." }, { status: 500 });
  }
}
