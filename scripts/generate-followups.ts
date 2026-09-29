import { createClient } from "@supabase/supabase-js";

const supabase=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
const apiKey=process.env.GEMINI_API_KEY?.trim() ?? "";
if(!apiKey) throw new Error("GEMINI_API_KEY is required");

async function main(){
  const now=new Date().toISOString();
  const {data:prospects,error}=await supabase.from("prospects")
    .select("id,name,company,email,reason,campaign_id,next_follow_up_at,status")
    .lte("next_follow_up_at",now)
    .in("status",["sent"])
    .not("campaign_id","is",null)
    .limit(50);
  if(error) throw error;

  let created=0;
  for(const prospect of prospects??[]){
    const {data:reply}=await supabase.from("email_threads").select("id").eq("prospect_id",prospect.id).eq("awaiting_reply",false).limit(1);
    if(reply && reply.length>0) continue;

    const {data:existing}=await supabase.from("email_drafts").select("id").eq("prospect_id",prospect.id).eq("status","pending").limit(1);
    if(existing && existing.length>0) continue;

    const {data:campaign}=await supabase.from("campaigns").select("name,topic,goal,audience,talking_points,tone,personalization_instructions").eq("id",prospect.campaign_id).single();
    if(!campaign) continue;

    const prompt=[
      "Write a concise follow-up B2B email.",
      "This is a follow-up to a previous outreach email. Do not claim the recipient saw, opened, or liked the previous email.",
      "Use only the supplied facts. Never invent metrics, customers, partnerships, achievements, or personal details.",
      "Keep it 60-100 words. Add one useful reason to continue the conversation and one simple call to action.",
      "",
      "CAMPAIGN:",JSON.stringify(campaign),
      "PROSPECT:",JSON.stringify({name:prospect.name,company:prospect.company,reason:prospect.reason}),
      'Return ONLY JSON: {"subject":"...","body":"..."}'
    ].join("\n");

    const geminiUrl=new URL("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    geminiUrl.searchParams.set("key",apiKey);
    const response=await fetch(geminiUrl,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.4,responseMimeType:"application/json"}})
    });
    if(!response.ok){console.error("Gemini follow-up failed",prospect.id,await response.text());continue;}
    const data=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>} ;
    const raw=data.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!raw) continue;
    const draft=JSON.parse(raw) as {subject?:unknown;body?:unknown};
    if(typeof draft.subject!=="string"||typeof draft.body!=="string") continue;

    const {error:insertError}=await supabase.from("email_drafts").insert({
      prospect_id:prospect.id,subject:draft.subject.trim(),body:draft.body.trim(),status:"pending",
      owner_id:(await supabase.from("prospects").select("owner_id").eq("id",prospect.id).single()).data?.owner_id??null
    });
    if(insertError){console.error("draft insert failed",prospect.id,insertError);continue;}

    await supabase.from("prospects").update({status:"draft",next_follow_up_at:null,updated_at:new Date().toISOString()}).eq("id",prospect.id);
    await supabase.from("activities").insert({campaign_id:prospect.campaign_id,prospect_id:prospect.id,type:"follow_up_draft_generated",detail:draft.subject.trim()});
    created++;
  }
  console.log(`Follow-up generation complete: ${created} drafts created.`);
}
main().catch(e=>{console.error(e);process.exit(1)});
