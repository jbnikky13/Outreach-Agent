import { NextResponse } from "next/server";

const INBOX_ID = process.env.AGENTMAIL_INBOX_ID;

export async function POST(req: Request) {
  if (!INBOX_ID) return NextResponse.json({ error: "AgentMail is not configured" }, { status: 500 });

  const { to, subject, text, html, approvalToken } = await req.json();
  if (approvalToken !== "APPROVED") return NextResponse.json({ error: "Human approval required" }, { status: 403 });
  if (!Array.isArray(to) || to.length === 0 || !subject || !text) return NextResponse.json({ error: "to, subject and text are required" }, { status: 400 });

  // The actual AgentMail SDK call will be enabled when the deployment has its server-side AgentMail credential.
  // This route intentionally fails closed until that secret is configured.
  return NextResponse.json({ error: "AgentMail server credential not configured yet" }, { status: 503 });
}
