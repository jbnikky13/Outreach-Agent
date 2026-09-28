"use client";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {getSupabaseBrowserClient} from "../lib/supabase";
import {Mail,Users,Send,Clock3,CheckCircle2,Plus,Search,ChevronRight,ShieldCheck,Sparkles,Inbox,Settings,LayoutDashboard} from "lucide-react";

type Prospect={id:string;name:string;company:string;email:string;status:"Draft"|"Ready"|"Sent"|"Replied";reason:string;campaign_id?:string};
const seed:Prospect[]=[
{id:"seed-1",name:"Alex Morgan",company:"Fintech Security Co.",email:"alex@example.com",status:"Draft",reason:"Wallet security and transaction protection"},
{id:"seed-2",name:"Jordan Lee",company:"Web3 Infrastructure",email:"jordan@example.com",status:"Ready",reason:"Developer tooling and wallet integrations"},
{id:"seed-3",name:"Taylor Okafor",company:"Payments Platform",email:"taylor@example.com",status:"Sent",reason:"Fraud prevention and payment security"},
{id:"seed-4",name:"Sam Rivera",company:"Crypto Custody Labs",email:"sam@example.com",status:"Replied",reason:"Institutional wallet security"},
];

export default function Home(){
 const [tab,setTab]=useState("Dashboard");
 const [prospects,setProspects]=useState(seed);
 const [selected,setSelected]=useState<Prospect|null>(null);
 const [query,setQuery]=useState("");
 const [showCampaign,setShowCampaign]=useState(false); const [showProspect,setShowProspect]=useState(false);
 const [campaign,setCampaign]=useState({name:"",topic:"",goal:"Book a conversation",audience:"",points:"",tone:"Professional",instructions:""}); const [newProspect,setNewProspect]=useState({name:"",email:"",company:"",website:"",reason:""});
 const [campaigns,setCampaigns]=useState<any[]>([]); const [selectedCampaignId,setSelectedCampaignId]=useState<string>(""); const [generating,setGenerating]=useState(false); const [draft,setDraft]=useState<{subject:string;body:string;personalization_note:string}|null>(null); const router=useRouter();
 useEffect(()=>{(async()=>{const s=getSupabaseBrowserClient(); const {data:{session}}=await s.auth.getSession(); if(!session){router.replace("/login");return} const {data}=await s.from("campaigns").select("id,name,topic,goal,audience,talking_points,tone,personalization_instructions,status").order("created_at",{ascending:false}); if(data)setCampaigns(data); const {data:ps}=await s.from("prospects").select("id,name,company,email,website,reason,status,campaign_id").order("created_at",{ascending:false}); if(ps)setProspects(ps as Prospect[]);})();},[router]);
 const filtered=useMemo(()=>prospects.filter(p=>(!selectedCampaignId||p.campaign_id===selectedCampaignId)&&(p.name+" "+p.company+" "+p.email).toLowerCase().includes(query.toLowerCase())),[prospects,query,selectedCampaignId]);
 const counts={draft:prospects.filter(p=>p.status==="Draft").length,ready:prospects.filter(p=>p.status==="Ready").length,sent:prospects.filter(p=>p.status==="Sent").length,replied:prospects.filter(p=>p.status==="Replied").length};
 async function sendApprovedDraft(id: string) {
  const p = prospects.find((x) => x.id === id);
  if (!p || !draft) return;

  const s = getSupabaseBrowserClient();
  const { data: { session } } = await s.auth.getSession();
  if (!session) {
    router.replace("/login");
    return;
  }

  const res = await fetch("/api/drafts/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prospectId: id,
      subject: draft.subject,
      body: draft.body,
      campaignId: selectedCampaignId
    })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Send failed");
    return;
  }

  setProspects((items) =>
    items.map((item) => item.id === id ? { ...item, status: "Sent" } : item)
  );
  setDraft(null);
  setSelected(null);
}
 async function approve(id:string){const p=prospects.find(x=>x.id===id); if(!p||!selectedCampaignId){setSelected(null);return} const s=getSupabaseBrowserClient(); const {data:{user}}=await s.auth.getUser(); if(!user){router.replace("/login");return} const campaignRow=campaigns.find(x=>x.id===selectedCampaignId); const body=`Hi ${p.name.split(" ")[0]},\n\nI’m reaching out regarding ${campaignRow?.topic||"a potential collaboration"}. ${campaignRow?.personalization_instructions||""}\n\n${campaignRow?.talking_points||""}\n\nWould you be open to a short conversation?\n\nBest,\nJbnikky`; const {error}=await s.from("email_drafts").insert({campaign_id:selectedCampaignId,prospect_id:id,subject:draft?.subject||campaignRow?.topic||"A quick conversation",body:draft?.body||"",status:"approved",approved_at:new Date().toISOString(),owner_id:user.id}); if(error){alert(error.message);return} setProspects(x=>x.map(p=>p.id===id?{...p,status:"Ready"}:p));setDraft(null);setSelected(null)}
 const navItems=[["Dashboard",LayoutDashboard],["Campaigns",Send],["Prospects",Users],["Inbox",Inbox],["Follow-ups",Clock3]] as const;
 return <main className="shell">
  <aside className="sidebar">
   <div className="brand"><div className="brandmark"><Sparkles size={18}/></div><div><b>Outreach Agent</b><span>Personal email copilot</span></div></div>
   <nav>{navItems.map(([label,Icon])=><button className={tab===label?"nav active":"nav"} onClick={()=>setTab(label)} key={label}><Icon size={18}/>{label}</button>)}</nav>
   <button className="nav bottom"><Settings size={18}/>Settings</button>
  </aside>
  <section className="content">
   <header><div><div className="eyebrow">CONTROL CENTER</div><h1>{tab}</h1><p>Turn outreach goals into personalized conversations.</p></div><div className="header-actions"><button className="secondary" onClick={()=>setShowProspect(true)}><Plus size={18}/>Add prospect</button><button className="primary" onClick={()=>setShowCampaign(true)}><Plus size={18}/>New campaign</button></div></header>
   {tab==="Dashboard"&&<><div className="notice"><ShieldCheck size={20}/><div><b>Human approval is ON</b><span>The agent can draft and organize outreach, but nothing is sent without your approval.</span></div></div>
    <div className="stats"><Stat icon={<Mail/>} label="Awaiting approval" value={counts.draft+counts.ready}/><Stat icon={<Send/>} label="Sent" value={counts.sent}/><Stat icon={<Inbox/>} label="Replies" value={counts.replied}/><Stat icon={<Clock3/>} label="Follow-ups" value={3}/></div>
    <div className="grid"><section className="card"><div className="cardhead"><div><h2>Approval queue</h2><p>Emails ready for your review</p></div><button className="link" onClick={()=>setTab("Prospects")}>View all <ChevronRight size={15}/></button></div>{prospects.filter(p=>p.status==="Draft"||p.status==="Ready").map(p=><ProspectRow key={p.id} p={p} onClick={()=>{setSelectedCampaignId(p.campaign_id||selectedCampaignId);setDraft(null);setSelected(p)}}/>)}</section>
    <section className="card"><div className="cardhead"><div><h2>Agent activity</h2><p>Latest workflow events</p></div></div><Activity text="Draft generated" detail="Fintech Security Co." time="9 min ago"/><Activity text="Reply detected" detail="Crypto Custody Labs" time="42 min ago"/><Activity text="Follow-up scheduled" detail="Payments Platform" time="2 hr ago"/></section></div></>}
   {tab==="Prospects"&&<section className="card full"><div className="toolbar"><div><h2>Prospects</h2><p>People and companies in your outreach pipeline.</p></div><select value={selectedCampaignId} onChange={e=>setSelectedCampaignId(e.target.value)}><option value="">All campaigns</option>{campaigns.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><div className="search"><Search size={16}/><input placeholder="Search prospects" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>{filtered.map(p=><ProspectRow key={p.id} p={p} onClick={()=>setSelected(p)}/>)}</section>}
   {tab==="Campaigns"&&<section className="card full"><div className="toolbar"><div><h2>Campaigns</h2><p>Define what every outreach email is about before the agent drafts it.</p></div></div><div className="campaign-grid">{campaigns.length?campaigns.map(x=><button className="campaign-card" key={x.id} onClick={()=>setSelectedCampaignId(x.id)}><b>{x.name}</b><span>{x.topic}</span><small>Goal: {x.goal} · Audience: {x.audience||"Not set"} · Tone: {x.tone||"Professional"}</small></button>):<div className="campaign-card"><b>No campaigns yet</b><span>Create your first outreach strategy.</span></div>}</div></section>}
   {tab!=="Dashboard"&&tab!=="Prospects"&&tab!=="Campaigns"&&<section className="empty card"><Sparkles size={28}/><h2>{tab} is coming next</h2><p>The foundation is ready. This module will connect to the database and email provider in the next build phase.</p></section>}
  </section>
  {selected&&<div className="overlay" onClick={()=>setSelected(null)}><div className="drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><div className="eyebrow">AI DRAFT</div><h2>{selectedCampaignId?campaigns.find(x=>x.id===selectedCampaignId)?.topic:"Potential security integration"} for {selected.company}</h2><p className="muted">To: {selected.name} · {selected.email}</p><div className="emailbox">{draft?<><b>{draft.subject}</b>{draft.body.split("\n").map((line,i)=><p key={i}>{line||"\u00a0"}</p>)}{draft.personalization_note&&<small className="muted">Personalization: {draft.personalization_note}</small>}</>:<p className="muted">Generate a campaign-specific draft before approving this prospect.</p>}</div><div className="actions"><button className="secondary" onClick={()=>setSelected(null)}>Close</button><button className="secondary" disabled={generating||!selectedCampaignId} onClick={async()=>{const campaignRow=campaigns.find(x=>x.id===selectedCampaignId);if(!campaignRow)return;setGenerating(true);setDraft(null);const r=await fetch("/api/drafts/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({campaign:campaignRow,prospect:selected})});const d=await r.json();setGenerating(false);if(!r.ok){alert(d.error||"Draft generation failed");return}setDraft(d)}}>{generating?"Generating…":"Generate AI draft"}</button><button className="primary" disabled={!draft} onClick={()=>sendApprovedDraft(selected.id)}><CheckCircle2 size={17}/>Approve draft</button></div></div></div>}
 {showProspect&&<div className="overlay" onClick={()=>setShowProspect(false)}><div className="drawer campaign-drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowProspect(false)}>×</button><div className="eyebrow">NEW PROSPECT</div><h2>Add someone to outreach</h2><p className="muted">Give the agent only the facts you know.</p><label>Name<input value={newProspect.name} onChange={e=>setNewProspect({...newProspect,name:e.target.value})}/></label><label>Email<input type="email" value={newProspect.email} onChange={e=>setNewProspect({...newProspect,email:e.target.value})}/></label><label>Company<input value={newProspect.company} onChange={e=>setNewProspect({...newProspect,company:e.target.value})}/></label><label>Website<input value={newProspect.website} onChange={e=>setNewProspect({...newProspect,website:e.target.value})}/></label><label>Why you are contacting them<input value={newProspect.reason} onChange={e=>setNewProspect({...newProspect,reason:e.target.value})}/></label><label>Campaign<select value={selectedCampaignId} onChange={e=>setSelectedCampaignId(e.target.value)}><option value="">Unassigned</option>{campaigns.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><div className="actions"><button className="secondary" onClick={()=>setShowProspect(false)}>Cancel</button><button className="primary" onClick={async()=>{if(!newProspect.name||!newProspect.email){alert("Name and email are required.");return}const s=getSupabaseBrowserClient();const {data:{user}}=await s.auth.getUser();if(!user){router.replace("/login");return}const {data,error}=await s.from("prospects").insert({...newProspect,campaign_id:selectedCampaignId||null,status:"Draft",owner_id:user.id}).select("id,name,company,email,website,reason,status,campaign_id").single();if(error){alert(error.message);return}setProspects(x=>[data as Prospect,...x]);setNewProspect({name:"",email:"",company:"",website:"",reason:""});setShowProspect(false);setTab("Prospects")}}>Add prospect</button></div></div></div>}{showCampaign&&<div className="overlay" onClick={()=>setShowCampaign(false)}><div className="drawer campaign-drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowCampaign(false)}>×</button><div className="eyebrow">NEW CAMPAIGN</div><h2>Define the outreach</h2><p className="muted">You choose the subject and goal. The agent personalizes each email.</p>{([["name","Campaign name"],["topic","Topic"],["audience","Target audience"],["points","Key talking points"],["instructions","Personalization instructions"]] as const).map(([key,label])=><label key={key}>{label}<input value={campaign[key]} onChange={e=>setCampaign({...campaign,[key]:e.target.value})} placeholder={label}/></label>)}<label>Goal<select value={campaign.goal} onChange={e=>setCampaign({...campaign,goal:e.target.value})}><option>Book a conversation</option><option>Request feedback</option><option>Introduce a product</option><option>Partnership</option><option>Other</option></select></label><label>Tone<select value={campaign.tone} onChange={e=>setCampaign({...campaign,tone:e.target.value})}><option>Professional</option><option>Friendly</option><option>Technical</option><option>Concise</option></select></label><div className="actions"><button className="secondary" onClick={()=>setShowCampaign(false)}>Cancel</button><button className="primary" onClick={async()=>{const s=getSupabaseBrowserClient(); const {data:{user}}=await s.auth.getUser(); if(!user)return router.replace("/login"); const {data,error}=await s.from("campaigns").insert({name:campaign.name,topic:campaign.topic,goal:campaign.goal,audience:campaign.audience,talking_points:campaign.points,tone:campaign.tone,personalization_instructions:campaign.instructions,owner_id:user.id}).select("id,name,topic,goal,audience,talking_points,tone,personalization_instructions,status").single(); if(error){alert(error.message);return} setCampaigns(x=>[data,...x]); setShowCampaign(false);setTab("Campaigns")}}>Create campaign</button></div></div></div>}</main>
}
function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <div className="stat"><div className="icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>}
function ProspectRow({p,onClick}:{p:Prospect;onClick:()=>void}){return <button className="row" onClick={onClick}><div className="avatar">{p.name.split(" ").map(x=>x[0]).join("")}</div><div className="rowmain"><b>{p.name}</b><span>{p.company} · {p.email}</span></div><span className={"status "+p.status.toLowerCase()}>{p.status}</span><ChevronRight size={17}/></button>}
function Activity({text,detail,time}:{text:string;detail:string;time:string}){return <div className="activity"><div className="dot"/><div><b>{text}</b><span>{detail}</span></div><time>{time}</time></div>}
