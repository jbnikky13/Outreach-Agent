"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Mailbox = {
  id: string; provider: string; email: string; displayName: string | null;
  active: boolean; selected: boolean; lastVerifiedAt: string | null;
};

export default function MailboxesPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState("");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (workspace: string, token: string) => {
    const response = await fetch("/api/mailboxes", {
      headers: { Authorization: "Bearer " + token, "x-workspace-id": workspace }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load mailboxes.");
    setMailboxes(data.mailboxes ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace("/login?next=%2Fmailboxes"); return; }
        const { data: memberships, error: membershipError } = await supabase.from("workspace_members")
          .select("workspace_id").eq("user_id", session.user.id).limit(2);
        if (membershipError || !memberships || memberships.length !== 1) {
          throw new Error(membershipError?.message || "Your account must have exactly one workspace membership.");
        }
        if (!active) return;
        setWorkspaceId(memberships[0].workspace_id);
        await load(memberships[0].workspace_id, session.access_token);
        if (search.get("connected") === "1") setMessage("Mailbox connected and selected. Email sending remains disabled until final safety checks are complete.");
        const callbackError = search.get("error");
        if (callbackError) setError(callbackError);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load mailbox settings.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [load, router, search]);

  async function connect(provider: "gmail" | "outlook") {
    setBusy(provider); setError(""); setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !workspaceId) throw new Error("Sign in and select your workspace first.");
      const response = await fetch("/api/mailboxes/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token, "x-workspace-id": workspaceId },
        body: JSON.stringify({ provider })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start mailbox connection.");
      window.location.assign(data.authorizationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mailbox connection failed.");
      setBusy("");
    }
  }

  async function act(mailbox: Mailbox, action: "select" | "disconnect") {
    setBusy(mailbox.id + action); setError(""); setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login?next=%2Fmailboxes"); return; }
      const response = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token, "x-workspace-id": workspaceId },
        body: JSON.stringify({ action, mailboxId: mailbox.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Mailbox update failed.");
      await load(workspaceId, session.access_token);
      setMessage(action === "select" ? mailbox.email + " is now your selected mailbox." : mailbox.email + " has been disconnected.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mailbox update failed.");
    } finally { setBusy(""); }
  }

  return <main style={{ maxWidth: 820, margin: "0 auto", padding: "36px 20px 64px" }}>
    <a href="/" style={{ color: "inherit", textDecoration: "none", opacity: .7 }}>← Back to Outreach Agent</a>
    <p style={{ letterSpacing: 2, fontSize: 12, fontWeight: 700, marginTop: 32 }}>ACCOUNT SETTINGS</p>
    <h1 style={{ fontSize: 32, margin: "8px 0" }}>Your mailboxes</h1>
    <p style={{ opacity: .72, lineHeight: 1.6 }}>Connect the Gmail or Outlook account you want to use. Each Telegram-linked member manages their own sender identity. Your credentials are encrypted before storage.</p>
    {message && <p role="status" style={{ padding: 14, background: "#e8f5ec", borderRadius: 10 }}>{message}</p>}
    {error && <p role="alert" style={{ padding: 14, background: "#fff0ed", borderRadius: 10 }}>{error}</p>}
    <section style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "24px 0" }}>
      <button disabled={!!busy || loading} onClick={() => connect("gmail")} style={buttonStyle}>{busy === "gmail" ? "Connecting…" : "Connect Gmail"}</button>
      <button disabled={!!busy || loading} onClick={() => connect("outlook")} style={buttonStyle}>{busy === "outlook" ? "Connecting…" : "Connect Outlook"}</button>
    </section>
    <h2 style={{ fontSize: 20, marginTop: 36 }}>Connected accounts</h2>
    {loading ? <p>Loading your mailboxes…</p> : mailboxes.length === 0 ? <p style={{ opacity: .7 }}>No mailboxes connected yet.</p> : <div style={{ display: "grid", gap: 12 }}>
      {mailboxes.map(mailbox => <article key={mailbox.id} style={{ border: "1px solid var(--border, #ddd)", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div><strong>{mailbox.email}</strong><p style={{ margin: "5px 0", opacity: .65 }}>{mailbox.provider === "gmail" ? "Google Gmail" : "Microsoft Outlook"}</p></div>
          {mailbox.selected && <span style={{ fontSize: 12, fontWeight: 700 }}>SELECTED SENDER</span>}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          {!mailbox.selected && mailbox.active && <button disabled={!!busy} onClick={() => act(mailbox, "select")} style={buttonStyle}>{busy === mailbox.id + "select" ? "Saving…" : "Select sender"}</button>}
          <button disabled={!!busy} onClick={() => act(mailbox, "disconnect")} style={{ ...buttonStyle, background: "transparent" }}>{busy === mailbox.id + "disconnect" ? "Disconnecting…" : "Disconnect"}</button>
        </div>
      </article>)}
    </div>}
    <p style={{ marginTop: 32, fontSize: 13, opacity: .65, lineHeight: 1.6 }}>Connecting a mailbox does not send email. Every outreach message still requires human approval. Sending is temporarily disabled while per-user sender safeguards are completed.</p>
  </main>;
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid var(--border, #ccc)", borderRadius: 10, padding: "11px 16px",
  background: "var(--foreground, #111)", color: "var(--background, #fff)", cursor: "pointer"
};
