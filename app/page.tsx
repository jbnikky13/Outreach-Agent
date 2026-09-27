"use client";
import {useMemo,useState} from "react";
import {Mail,Users,Send,Clock3,CheckCircle2,Plus,Search,ChevronRight,ShieldCheck,Sparkles,Inbox,Settings,LayoutDashboard} from "lucide-react";

type Prospect={id:number;name:string;company:string;email:string;status:"Draft"|"Ready"|"Sent"|"Replied";reason:string};
const seed:Prospect[]=[
{id:1,name:"Alex Morgan",company:"Fintech Security Co.",email:"alex@example.com",status:"Draft",reason:"Wallet security and transaction protection"},
{id:2,name:"Jordan Lee",company:"Web3 Infrastructure",email:"jordan@example.com",status:"Ready",reason:"Developer tooling and wallet integrations"},
{id:3,name:"Taylor Okafor",company:"Payments Platform",email:"taylor@example.com",status:"Sent",reason:"Fraud prevention and payment security"},
{id:4,name:"Sam Rivera",company:"Crypto Custody Labs",email:"sam@example.com",status:"Replied",reason:"Institutional wallet security"},
];

export default function Home(){
 const [tab,setTab]=useState("Dashboard");
 const [prospects,setProspects]=useState(seed);
 const [selected,setSelected]=useState<Prospect|null>(null);
 const [query,setQuery]=useState("");
 const filtered=useMemo(()=>prospects.filter(p=>(p.name+" "+p.company+" "+p.email).toLowerCase().includes(query.toLowerCase())),[prospects,query]);
 const counts={draft:prospects.filter(p=>p.status==="Draft").length,ready:prospects.filter(p=>p.status==="Ready").length,sent:prospects.filter(p=>p.status==="Sent").length,replied:prospects.filter(p=>p.status==="Replied").length};
 function approve(id:number){setProspects(x=>x.map(p=>p.id===id?{...p,status:"Sent"}:p));setSelected(null)}
 const navItems=[["Dashboard",LayoutDashboard],["Campaigns",Send],["Prospects",Users],["Inbox",Inbox],["Follow-ups",Clock3]] as const;
 return <main className="shell">
  <aside className="sidebar">
   <div className="brand"><div className="brandmark"><Sparkles size={18}/></div><div><b>Outreach Agent</b><span>Personal email copilot</span></div></div>
   <nav>{navItems.map(([label,Icon])=><button className={tab===label?"nav active":"nav"} onClick={()=>setTab(label)} key={label}><Icon size={18}/>{label}</button>)}</nav>
   <button className="nav bottom"><Settings size={18}/>Settings</button>
  </aside>
  <section className="content">
   <header><div><div className="eyebrow">CONTROL CENTER</div><h1>{tab}</h1><p>Turn outreach goals into personalized conversations.</p></div><button className="primary"><Plus size={18}/>New campaign</button></header>
   {tab==="Dashboard"&&<><div className="notice"><ShieldCheck size={20}/><div><b>Human approval is ON</b><span>The agent can draft and organize outreach, but nothing is sent without your approval.</span></div></div>
    <div className="stats"><Stat icon={<Mail/>} label="Awaiting approval" value={counts.draft+counts.ready}/><Stat icon={<Send/>} label="Sent" value={counts.sent}/><Stat icon={<Inbox/>} label="Replies" value={counts.replied}/><Stat icon={<Clock3/>} label="Follow-ups" value={3}/></div>
    <div className="grid"><section className="card"><div className="cardhead"><div><h2>Approval queue</h2><p>Emails ready for your review</p></div><button className="link" onClick={()=>setTab("Prospects")}>View all <ChevronRight size={15}/></button></div>{prospects.filter(p=>p.status==="Draft"||p.status==="Ready").map(p=><ProspectRow key={p.id} p={p} onClick={()=>setSelected(p)}/>)}</section>
    <section className="card"><div className="cardhead"><div><h2>Agent activity</h2><p>Latest workflow events</p></div></div><Activity text="Draft generated" detail="Fintech Security Co." time="9 min ago"/><Activity text="Reply detected" detail="Crypto Custody Labs" time="42 min ago"/><Activity text="Follow-up scheduled" detail="Payments Platform" time="2 hr ago"/></section></div></>}
   {tab==="Prospects"&&<section className="card full"><div className="toolbar"><div><h2>Prospects</h2><p>People and companies in your outreach pipeline.</p></div><div className="search"><Search size={16}/><input placeholder="Search prospects" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>{filtered.map(p=><ProspectRow key={p.id} p={p} onClick={()=>setSelected(p)}/>)}</section>}
   {tab!=="Dashboard"&&tab!=="Prospects"&&<section className="empty card"><Sparkles size={28}/><h2>{tab} is coming next</h2><p>The foundation is ready. This module will connect to the database and email provider in the next build phase.</p></section>}
  </section>
  {selected&&<div className="overlay" onClick={()=>setSelected(null)}><div className="drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><div className="eyebrow">AI DRAFT</div><h2>Potential security integration for {selected.company}</h2><p className="muted">To: {selected.name} · {selected.email}</p><div className="emailbox"><p>Hi {selected.name.split(" ")[0]},</p><p>I came across {selected.company} and noticed your work around {selected.reason.toLowerCase()}. I’m building a security-focused product that helps make wallet interactions safer and easier to verify.</p><p>I’d love to share a short overview and explore whether there could be a useful fit for your team.</p><p>Would you be open to a quick conversation?</p><p>Best,<br/>Jbnikky</p></div><div className="actions"><button className="secondary" onClick={()=>setSelected(null)}>Edit later</button><button className="primary" onClick={()=>approve(selected.id)}><CheckCircle2 size={17}/>Approve & send</button></div></div></div>}
 </main>
}
function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <div className="stat"><div className="icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>}
function ProspectRow({p,onClick}:{p:Prospect;onClick:()=>void}){return <button className="row" onClick={onClick}><div className="avatar">{p.name.split(" ").map(x=>x[0]).join("")}</div><div className="rowmain"><b>{p.name}</b><span>{p.company} · {p.email}</span></div><span className={"status "+p.status.toLowerCase()}>{p.status}</span><ChevronRight size={17}/></button>}
function Activity({text,detail,time}:{text:string;detail:string;time:string}){return <div className="activity"><div className="dot"/><div><b>{text}</b><span>{detail}</span></div><time>{time}</time></div>}
