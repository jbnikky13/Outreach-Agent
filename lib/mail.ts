type Provider = "gmail" | "outlook";

function required(name:string){const v=process.env[name];if(!v)throw new Error("Missing "+name);return v;}

async function gmailToken(){
  const body=new URLSearchParams({client_id:required("MAIL_CLIENT_ID"),client_secret:required("MAIL_CLIENT_SECRET"),refresh_token:required("MAIL_REFRESH_TOKEN"),grant_type:"refresh_token"});
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
  if(!r.ok) throw new Error("Gmail token refresh failed: "+await r.text());
  return (await r.json()).access_token as string;
}
function b64url(s:string){return Buffer.from(s).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
export async function sendGmail(to:string,subject:string,text:string){
  const token=await gmailToken();
  const raw=[`To: ${to}`,`Subject: ${subject}`,`Content-Type: text/plain; charset=UTF-8`,"",text].join("\r\n");
  const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({raw:b64url(raw)})});
  if(!r.ok) throw new Error("Gmail send failed: "+await r.text());
  return await r.json() as {id:string;threadId?:string};
}
async function outlookToken(){
  const body=new URLSearchParams({client_id:required("MAIL_CLIENT_ID"),client_secret:required("MAIL_CLIENT_SECRET"),refresh_token:required("MAIL_REFRESH_TOKEN"),grant_type:"refresh_token",scope:"https://graph.microsoft.com/.default offline_access"});
  const r=await fetch(`https://login.microsoftonline.com/${required("MAIL_TENANT_ID")}/oauth2/v2.0/token`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
  if(!r.ok) throw new Error("Outlook token refresh failed: "+await r.text());
  return (await r.json()).access_token as string;
}
export async function sendOutlook(to:string,subject:string,text:string){
  const token=await outlookToken();
  const r=await fetch("https://graph.microsoft.com/v1.0/me/sendMail",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({message:{subject,toRecipients:[{emailAddress:{address:to}}],body:{contentType:"Text",content:text}}})});
  if(!r.ok) throw new Error("Outlook send failed: "+await r.text());
  return {id:"outlook-"+Date.now()};
}
export async function sendMail(to:string,subject:string,text:string){
  const provider=(process.env.MAIL_PROVIDER??"").toLowerCase() as Provider;
  if(provider==="gmail") return sendGmail(to,subject,text);
  if(provider==="outlook") return sendOutlook(to,subject,text);
  throw new Error("MAIL_PROVIDER must be gmail or outlook");
}
