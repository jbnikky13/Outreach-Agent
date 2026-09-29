import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMail } from "../../../../lib/mail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { prospectId, subject, body, campaignId, draftId } = await request.json();
    if (!prospectId || !subject || !body) return NextResponse.json({error:"Prospect, subject and body are required."},{status:400});
    const supabase=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:prospect,error:prospectError}=await supabase.from("prospects").select("id,email,name,owner_id,campaign_id").eq("id",prospectId).single();
    if(prospectError||!prospect) return NextResponse.json({error:"Prospect not found."},{status:404});
    let draft: { id: string } | null = null;
    if (draftId) {
      const { data: updated, error: updateDraftError } = await supabase.from("email_drafts").update({ subject, body, status:"approved", approved_at:new Date().toISOString(), owner_id:prospect.owner_id }).eq("id",draftId).eq("prospect_id",prospectId).eq("status","pending").select("id").single();
      if(updateDraftError||!updated) return NextResponse.json({error:updateDraftError?.message||"Pending draft not found."},{status:404});
      draft=updated;
    } else {
      const { data: inserted, error: insertError } = await supabase.from("email_drafts").insert({prospect_id:prospectId,subject,body,status:"approved",approved_at:new Date().toISOString(),owner_id:prospect.owner_id}).select("id").single();
      if(insertError||!inserted) return NextResponse.json({error:insertError?.message||"Could not save approved draft."},{status:500});
      draft=inserted;
    }
    const result: { id: string; threadId?: string } = await sendMail(prospect.email,subject,body);
    const now=new Date().toISOString();
    await supabase.from("email_drafts").update({status:"sent",sent_at:now,provider_message_id:result.id}).eq("id",draft.id);
    const nextFollowUp = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("prospects").update({status:"sent",last_contacted_at:now,next_follow_up_at:nextFollowUp}).eq("id",prospectId);
    const threadPayload = {
      prospect_id: prospectId,
      provider: process.env.MAIL_PROVIDER,
      provider_message_id: result.id,
      provider_thread_id: result.threadId || null,
      last_message_at: now,
      awaiting_reply: true,
      owner_id: prospect.owner_id
    };
    const { error: threadInsertError } = await supabase
      .from("email_threads")
      .insert(threadPayload);
    if (threadInsertError) {
      const { data: existingThread } = await supabase
        .from("email_threads")
        .select("id")
        .eq("provider_message_id", result.id)
        .maybeSingle();
      if (!existingThread) throw threadInsertError;
    }
    await supabase.from("activities").insert({campaign_id:prospect.campaign_id||campaignId||null,prospect_id:prospectId,type:"email_sent",detail:subject,owner_id:prospect.owner_id});
    return NextResponse.json({success:true,messageId:result.id,threadId:result.threadId||null,draftId:draft.id});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Email send failed."},{status:500});
  }
}
