import { createClient } from "@supabase/supabase-js";
import { sendMail } from "../lib/mail";

const supabase=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
const campaignId=process.env.CAMPAIGN_ID;

if(!campaignId) throw new Error("CAMPAIGN_ID is required");

const {data:drafts,error}=await supabase.from("email_drafts").select("id,prospect_id,subject,body,status,provider_message_id,prospects!inner(email,name)").eq("status","approved").is("provider_message_id",null);
if(error) throw error;

for(const draft of drafts??[]){
  const prospect:any=draft.prospects;
  const {error:markError}=await supabase.from("email_drafts").update({send_attempted_at:new Date().toISOString()}).eq("id",draft.id).is("provider_message_id",null);
  if(markError) throw markError;
  try{
    const result=await sendMail(prospect.email,draft.subject,draft.body);
    const {error:updateError}=await supabase.from("email_drafts").update({status:"sent",sent_at:new Date().toISOString(),provider_message_id:result.id}).eq("id",draft.id).is("provider_message_id",null);
    if(updateError) throw updateError;
    await supabase.from("prospects").update({status:"sent",last_contacted_at:new Date().toISOString()}).eq("id",draft.prospect_id);
    await supabase.from("activities").insert({campaign_id:campaignId,prospect_id:draft.prospect_id,type:"email_sent",detail:draft.subject});
    console.log("sent",draft.id,prospect.email);
  }catch(error){
    console.error("failed",draft.id,prospect.email,error);
    process.exitCode=1;
  }
}
