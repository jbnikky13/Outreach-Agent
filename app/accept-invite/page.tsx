"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase";

export default function AcceptInvite() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Checking your invitation session…");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(value);
    (async () => {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
      if (session?.user?.email) {
        setEmail(session.user.email);
        setMessage("Invitation ready. Confirm to join the workspace associated with this email.");
      } else {
        setMessage("Open the invitation email link in this browser to complete email verification, then return here.");
      }
    })();
  }, []);

  async function accept() {
    if (!token) return;
    setLoading(true);
    setMessage("");
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
    if (!session) {
      setLoading(false);
      setMessage("Your verified invitation session is missing. Open the invitation email link again in this browser.");
      return;
    }
    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token
      },
      body: JSON.stringify({ token })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error || "Invitation could not be accepted.");
      return;
    }
    setMessage("Invitation accepted. Opening your workspace…");
    router.replace("/");
  }

  return <main className="auth-shell"><section className="auth-card">
    <div className="eyebrow">OUTREACH AGENT</div>
    <h1>Join a workspace</h1>
    <p className="muted">{email ? "Signed in as " + email : "Secure invitation acceptance"}</p>
    {!token && <p className="auth-message">This invitation link is missing its token. Ask your workspace administrator for a new invitation.</p>}
    {message && <p className="auth-message">{message}</p>}
    <button className="primary auth-submit" disabled={!token || !email || loading} onClick={accept}>
      {loading ? "Accepting…" : "Accept invitation"}
    </button>
  </section></main>;
}
