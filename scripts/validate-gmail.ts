async function main(){
  const provider=(process.env.MAIL_PROVIDER??"").toLowerCase();
  if(provider!=="gmail") throw new Error("Expected MAIL_PROVIDER=gmail");
  for(const name of ["MAIL_CLIENT_ID","MAIL_CLIENT_SECRET","MAIL_REFRESH_TOKEN"]) if(!process.env[name]) throw new Error("Missing "+name);
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.MAIL_CLIENT_ID!,client_secret:process.env.MAIL_CLIENT_SECRET!,refresh_token:process.env.MAIL_REFRESH_TOKEN!,grant_type:"refresh_token"})});
  const data=await r.json();
  if(!r.ok) throw new Error("Gmail OAuth validation failed: "+JSON.stringify(data));
  const g=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile",{headers:{Authorization:"Bearer "+data.access_token}});
  const profile=await g.json();
  if(!g.ok) throw new Error("Gmail API validation failed: "+JSON.stringify(profile));
  console.log("Gmail OAuth/API validation passed.");
  console.log("Authorized mailbox:",profile.emailAddress);
  console.log("Messages total:",profile.messagesTotal);
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1)});