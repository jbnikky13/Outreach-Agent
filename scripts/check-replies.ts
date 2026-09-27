import { createClient } from "@supabase/supabase-js";

const supabase=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
const provider=(process.env.MAIL_PROVIDER??"").toLowerCase();

async function token(){
  if(provider==="gmail"){
    const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.MAIL_CLIENT_ID!,client_secret:process.env.MAIL_CLIENT_SECRET!,refresh_token:process.env.MAIL_REFRESH_TOKEN!,grant_type:"refresh_token"})});
    if(!r.ok) throw new Error("Gmail token refresh failed");
    return (await r.json()).access_token;
  }
  if(provider==="outlook"){
    const r=await fetch(`https://login.microsoftonline.com/${process.env.MAIL_TENANT_ID}/oauth2/v2.0/token`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.MAIL_CLIENT_ID!,client_secret:process.env.MAIL_CLIENT_SECRET!,refresh_token:process.env.MAIL_REFRESH_TOKEN!,grant_type:"refresh_token",scope:"https://graph.microsoft.com/.default offline_access"})});
    if(!r.ok) throw new Error("Outlook token refresh failed");
    return (await r.json()).access_token;
  }
  throw new Error("MAIL_PROVIDER must be gmail or outlook");
}

async function main(){
  const access=await token();
  if(provider==="gmail"){
    const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is%3Ainbox%20newer_than%3A1d",{headers:{Authorization:`Bearer ${access}`}});
    if(!r.ok) throw new Error("Gmail inbox query failed");
    const data=await r.json();
    console.log("Gmail messages discovered:",data.messages?.length??0);
    // Message/thread parsing is deliberately kept separate from state updates until sender/thread matching is configured.
  }else{
    const r=await fetch("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$orderby=receivedDateTime%20desc",{headers:{Authorization:`Bearer ${access}`}});
    if(!r.ok) throw new Error("Outlook inbox query failed");
    const data=await r.json();
    console.log("Outlook messages discovered:",data.value?.length??0);
  }
}
main().catch(e=>{console.error(e);process.exit(1)});