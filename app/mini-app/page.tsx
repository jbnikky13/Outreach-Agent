"use client";

import { useEffect, useMemo, useState } from "react";

type Campaign = { id: string; name: string; topic: string | null; goal: string | null; status: string };
type Prospect = { id: string; name: string; company: string | null; email: string; status: string; campaign_id: string | null };
type Draft = { id: string; prospect_id: string; subject: string; body: string; status: "pending" | "approved"; created_at: string };
type Research = { id: string; company_name: string; website: string | null; industry: string | null; research_status: string };
type Dashboard = {
  workspace: { id: string; role: string };
  summary: { campaigns: number; prospects: number; awaitingApproval: number; approvedUnsent: number; researchedCompanies: number };
  campaigns: Campaign[];
  prospects: Prospect[];
  drafts: Draft[];
  research: Research[];
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        colorScheme?: "light" | "dark";
      };
    };
  }
}

type View = "Overview" | "Campaigns" | "Prospects" | "Approvals" | "Research";

export default function TelegramMiniApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [view, setView] = useState<View>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  async function loadDashboard() {
    const response = await fetch("/api/telegram/dashboard", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load your workspace.");
    setDashboard(payload as Dashboard);
  }

  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        const existing = await fetch("/api/telegram/session", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store"
        });
        if (existing.ok) {
          await loadDashboard();
          return;
        }

        const telegram = window.Telegram?.WebApp;
        if (!telegram || !telegram.initData) {
          throw new Error("Open Outreach Agent from its Telegram bot to sign in. The website login is not used inside the Mini App.");
        }
        telegram.ready();
        telegram.expand();

        const exchange = await fetch("/api/telegram/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: telegram.initData })
        });
        const result = await exchange.json();
        if (!exchange.ok) throw new Error(result.error || "Telegram sign-in failed.");
        await loadDashboard();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Something went wrong.");
      } finally {
        if (active) setLoading(false);
      }
    }
    boot();
    return () => { active = false; };
  }, []);

  const drafts = useMemo(() => dashboard?.drafts ?? [], [dashboard]);
  const campaigns = dashboard?.campaigns ?? [];
  const prospects = dashboard?.prospects ?? [];
  const research = dashboard?.research ?? [];

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/telegram/session", { method: "DELETE", credentials: "same-origin" });
    setDashboard(null);
    setError("You have signed out. Reopen Outreach Agent from the Telegram bot to sign in again.");
    setLoggingOut(false);
  }

  if (loading) {
    return <main className="tg-shell"><div className="tg-loading"><div className="tg-mark">OA</div><h1>Outreach Agent</h1><p>Securing your Telegram session…</p></div></main>;
  }

  if (error || !dashboard) {
    return (
      <main className="tg-shell">
        <section className="tg-error">
          <div className="tg-mark">OA</div>
          <p className="tg-eyebrow">TELEGRAM WORKSPACE</p>
          <h1>You're not connected yet</h1>
          <p>{error || "We couldn't load your workspace."}</p>
          <button className="tg-primary" onClick={() => window.Telegram?.WebApp?.close()}>Close Mini App</button>
        </section>
      </main>
    );
  }

  return (
    <main className="tg-shell">
      <header className="tg-header">
        <div className="tg-brand"><div className="tg-mark">OA</div><div><b>Outreach Agent</b><span>Workspace copilot</span></div></div>
        <button className="tg-logout" onClick={logout} disabled={loggingOut}>{loggingOut ? "Signing out…" : "Sign out"}</button>
      </header>

      <section className="tg-welcome">
        <p className="tg-eyebrow">YOUR WORKSPACE · {dashboard.workspace.role.toUpperCase()}</p>
        <h1>Make every conversation count.</h1>
        <p>Research, organize prospects and review outreach drafts from Telegram.</p>
      </section>

      <nav className="tg-tabs" aria-label="Workspace sections">
        {(["Overview", "Campaigns", "Prospects", "Approvals", "Research"] as View[]).map((item) => (
          <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>
        ))}
      </nav>

      {view === "Overview" && (
        <>
          <section className="tg-stats">
            <article><span>Campaigns</span><b>{dashboard.summary.campaigns}</b></article>
            <article><span>Prospects</span><b>{dashboard.summary.prospects}</b></article>
            <article><span>Awaiting review</span><b>{dashboard.summary.awaitingApproval}</b></article>
            <article><span>Approved drafts</span><b>{dashboard.summary.approvedUnsent}</b></article>
          </section>
          <section className="tg-panel">
            <div className="tg-panel-head"><h2>Recent campaigns</h2><button onClick={() => setView("Campaigns")}>View all</button></div>
            {campaigns.slice(0, 4).map((campaign) => <div className="tg-list-row" key={campaign.id}><div><b>{campaign.name}</b><span>{campaign.topic || campaign.goal || "No campaign description"}</span></div><small>{campaign.status}</small></div>)}
            {!campaigns.length && <p className="tg-empty">Your campaigns will appear here when created.</p>}
          </section>
          <section className="tg-panel">
            <div className="tg-panel-head"><h2>Needs your attention</h2><button onClick={() => setView("Approvals")}>Review queue</button></div>
            {drafts.filter((draft) => draft.status === "pending").slice(0, 3).map((draft) => {
              const prospect = prospects.find((item) => item.id === draft.prospect_id);
              return <div className="tg-list-row" key={draft.id}><div><b>{draft.subject}</b><span>{prospect?.company || prospect?.name || "Prospect"} · Awaiting approval</span></div><small>Draft</small></div>;
            })}
            {!drafts.some((draft) => draft.status === "pending") && <p className="tg-empty">No drafts are waiting for approval.</p>}
          </section>
        </>
      )}

      {view === "Campaigns" && <section className="tg-panel"><h2>Campaigns</h2>{campaigns.map((campaign) => <div className="tg-list-row" key={campaign.id}><div><b>{campaign.name}</b><span>{campaign.topic || campaign.goal || "No description"}</span></div><small>{campaign.status}</small></div>)}{!campaigns.length && <p className="tg-empty">No campaigns yet.</p>}</section>}

      {view === "Prospects" && <section className="tg-panel"><h2>Prospects</h2>{prospects.map((prospect) => <div className="tg-list-row" key={prospect.id}><div><b>{prospect.name}</b><span>{prospect.company || prospect.email}</span></div><small>{prospect.status.replaceAll("_", " ")}</small></div>)}{!prospects.length && <p className="tg-empty">No prospects yet.</p>}</section>}

      {view === "Approvals" && <section className="tg-panel"><h2>Draft approval queue</h2><p className="tg-note">Drafts are shown for review. Approval and sending controls will be enabled only after their Telegram-specific authorization and audit checks are wired.</p>{drafts.map((draft) => { const prospect = prospects.find((item) => item.id === draft.prospect_id); return <article className="tg-draft" key={draft.id}><div className="tg-draft-meta"><b>{draft.subject}</b><small>{prospect?.company || prospect?.name || "Prospect"} · {draft.status}</small></div><p>{draft.body}</p></article>; })}{!drafts.length && <p className="tg-empty">No unsent drafts.</p>}</section>}

      {view === "Research" && <section className="tg-panel"><h2>Company research</h2>{research.map((company) => <div className="tg-list-row" key={company.id}><div><b>{company.company_name}</b><span>{company.industry || company.website || "Details pending"}</span></div><small>{company.research_status.replaceAll("_", " ")}</small></div>)}{!research.length && <p className="tg-empty">No company research yet.</p>}</section>}

      <footer className="tg-footer">Human approval stays on. No email is sent from this dashboard.</footer>
    </main>
  );
}
