import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "../../../../lib/server/workspace-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireWorkspaceAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { supabase, workspaceId } = access.context;
  const [campaignsResult, prospectsResult, draftsResult, researchResult] = await Promise.all([
    supabase.from("campaigns")
      .select("id,name,topic,goal,audience,status,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("prospects")
      .select("id,name,company,email,status,campaign_id,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("email_drafts")
      .select("id,prospect_id,subject,body,status,created_at,mailbox_id,created_by,approved_by,approved_at")
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "approved"])
      .is("provider_message_id", null)
      .is("sent_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("company_research")
      .select("id,company_name,website,industry,research_status,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  const failed = [campaignsResult, prospectsResult, draftsResult, researchResult].find((result) => result.error);
  if (failed?.error) {
    console.error("Telegram dashboard query failed", failed.error);
    return NextResponse.json({ error: "Could not load workspace dashboard." }, { status: 500 });
  }

  const campaigns = campaignsResult.data ?? [];
  const prospects = prospectsResult.data ?? [];
  const drafts = draftsResult.data ?? [];
  const research = researchResult.data ?? [];
  const pendingDrafts = drafts.filter((draft) => draft.status === "pending");
  const approvedDrafts = drafts.filter((draft) => draft.status === "approved");

  const response = NextResponse.json({
    workspace: { id: workspaceId, role: access.context.role },
    summary: {
      campaigns: campaigns.length,
      prospects: prospects.length,
      awaitingApproval: pendingDrafts.length,
      approvedUnsent: approvedDrafts.length,
      researchedCompanies: research.length
    },
    campaigns,
    prospects,
    drafts,
    research
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
