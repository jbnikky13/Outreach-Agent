"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import {getSupabaseBrowserClient} from "../../lib/supabase";

export default function Login(){
 const router=useRouter(); const [mode,setMode]=useState<"signin">("signin");
 const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [message,setMessage]=useState(""); const [loading,setLoading]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setLoading(true);setMessage("");
  const supabase=getSupabaseBrowserClient();
  const result=await supabase.auth.signInWithPassword({email,password});
  setLoading(false);
  if(result.error){setMessage(result.error.message);return}
  if(mode==="signup"&&!result.data.session){setMessage("Check your email to confirm your account, then sign in.");return}
  router.push("/");
 }
 return <main className="auth-shell"><form className="auth-card" onSubmit={submit}><div className="eyebrow">OUTREACH AGENT</div><h1>Sign in</h1><p className="muted">Your campaigns, prospects and approvals stay tied to your account.</p><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label>{message&&<p className="auth-message">{message}</p>}<button className="primary auth-submit" disabled={loading}>{loading?"Working…":mode==="signin"?"Sign in":"Create account"}</button><p className="muted auth-switch">Invitation-only access. Ask your workspace administrator for an invitation.</p></form></main>
}