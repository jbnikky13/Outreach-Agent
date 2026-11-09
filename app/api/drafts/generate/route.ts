import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "../../../../lib/server/workspace-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireWorkspaceAccess(request, ["owner", "admin", "member"]);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const { campaignId, prospectId } = await request.json();
    if (typeof campaignId !== "string" || typeof prospectId !== "string") {
      return NextResponse.json({ error: "Campaign and prospect IDs are required." }, { status: 400 });
    }

    const { supabase, user, workspaceId } = access.context;

    const { data: mailboxPreference } = await supabase.from("user_mailbox_preferences")
      .select("mailbox_id").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
    if (!mailboxPreference?.mailbox_id) {
      return NextResponse.json({ error: "Connect and select your own Gmail or Outlook mailbox before generating outreach drafts." }, { status: 409 });
    }
    const { data: selectedMailbox } = await supabase.from("mailboxes")
      .select("id,provider,email,active,connected_by,revoked_at")
      .eq("id", mailboxPreference.mailbox_id).eq("workspace_id", workspaceId)
      .eq("connected_by", user.id).eq("active", true).is("revoked_at", null).maybeSingle();
    if (!selectedMailbox) {
      return NextResponse.json({ error: "Your selected mailbox is unavailable or no longer connected. Select an active mailbox you own." }, { status: 409 });
    }
    const [{ data: campaign, error: campaignError }, { data: prospect, error: prospectError }] = await Promise.all([
      supabase.from("campaigns")
        .select("id,name,topic,goal,audience,talking_points,tone,personalization_instructions")
        .eq("id", campaignId).eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("prospects")
        .select("id,name,company,email,reason,owner_id,campaign_id")
        .eq("id", prospectId).eq("workspace_id", workspaceId).maybeSingle()
    ]);

    if (campaignError || !campaign) return NextResponse.json({ error: "Campaign not found in this workspace." }, { status: 404 });
    if (prospectError || !prospect) return NextResponse.json({ error: "Prospect not found in this workspace." }, { status: 404 });
    if (!prospect.email) return NextResponse.json({ error: "Prospect has no email address." }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "AI generation is not configured." }, { status: 503 });

    const prompt = [
      "You write concise, credible B2B outreach emails.",
      "Follow the campaign exactly. Never invent facts, achievements, partnerships, metrics, funding, customers, or personal details.",
      "Use only the supplied campaign and prospect information. Do not mention AI.",
      "CAMPAIGN", JSON.stringify(campaign),
      "PROSPECT", JSON.stringify({ name: prospect.name, company: prospect.company, email: prospect.email, reason: prospect.reason }),
      'Return ONLY valid JSON: {"subject":"...","body":"...","personalization_note":"..."}',
      "Body: 100-160 words, natural, specific to supplied facts, ending with one simple call to action."
    ].join("\n");

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, responseMimeType: "application/json" } })
    });
    const payload = await response.json();
    if (!response.ok) return NextResponse.json({ error: "AI generation provider failed.", detail: payload?.error?.message ?? null }, { status: 502 });

    const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof raw !== "string") return NextResponse.json({ error: "AI returned no draft." }, { status: 502 });
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: "AI returned invalid draft data." }, { status: 502 }); }
    if (typeof parsed.subject !== "string" || !parsed.subject.trim() || typeof parsed.body !== "string" || !parsed.body.trim()) {
      return NextResponse.json({ error: "AI returned an incomplete draft." }, { status: 502 });
    }

    const { data: saved, error: saveError } = await supabase.from("email_drafts").insert({
      prospect_id: prospect.id,
      owner_id: prospect.owner_id ?? user.id,
      workspace_id: workspaceId,
      subject: parsed.subject.trim(),
      body: parsed.body.trim(),
      status: "pending",
      mailbox_id: selectedMailbox.id,
      created_by: user.id
    }).select("id,status,subject,body").single();

    if (saveError || !saved) {
      console.error("draft save failed", saveError);
      return NextResponse.json({ error: "Could not save generated draft." }, { status: 500 });
    }

    return NextResponse.json({
      id: saved.id, status: saved.status, subject: saved.subject, body: saved.body,
      personalization_note: typeof parsed.personalization_note === "string" ? parsed.personalization_note.trim() : ""
    });
  } catch (error) {
    console.error("draft generation failed", error);
    return NextResponse.json({ error: "Draft generation failed." }, { status: 500 });
  }
}
