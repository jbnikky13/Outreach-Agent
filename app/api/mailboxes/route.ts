import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "../../../../lib/server/workspace-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireWorkspaceAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase, user, workspaceId } = access.context;
  const [{ data: mailboxes, error }, { data: preference }] = await Promise.all([
    supabase.from("mailboxes").select("id,provider,email,display_name,active,revoked_at,last_verified_at,connected_by")
      .eq("workspace_id", workspaceId).eq("connected_by", user.id).order("created_at", { ascending: false }),
    supabase.from("user_mailbox_preferences").select("mailbox_id")
      .eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle()
  ]);
  if (error) {
    console.error("mailbox list failed", error);
    return NextResponse.json({ error: "Could not load your mailboxes." }, { status: 500 });
  }
  return NextResponse.json({
    mailboxes: (mailboxes ?? []).map(mailbox => ({
      id: mailbox.id, provider: mailbox.provider, email: mailbox.email,
      displayName: mailbox.display_name, active: mailbox.active && !mailbox.revoked_at,
      selected: preference?.mailbox_id === mailbox.id,
      lastVerifiedAt: mailbox.last_verified_at
    }))
  });
}

export async function POST(request: Request) {
  const access = await requireWorkspaceAccess(request, ["owner", "admin", "member"]);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const action = body?.action;
    const mailboxId = body?.mailboxId;
    if (typeof mailboxId !== "string" || !/^[0-9a-f-]{36}$/i.test(mailboxId)) {
      return NextResponse.json({ error: "A valid mailbox ID is required." }, { status: 400 });
    }
    const { supabase, user, workspaceId } = access.context;
    const { data: mailbox } = await supabase.from("mailboxes")
      .select("id,provider,email,active,revoked_at").eq("id", mailboxId)
      .eq("workspace_id", workspaceId).eq("connected_by", user.id).maybeSingle();
    if (!mailbox) return NextResponse.json({ error: "Mailbox not found in your account." }, { status: 404 });

    if (action === "select") {
      if (!mailbox.active || mailbox.revoked_at) return NextResponse.json({ error: "Reconnect this mailbox before selecting it." }, { status: 409 });
      const { data: credential } = await supabase.from("mailbox_credentials").select("mailbox_id")
        .eq("mailbox_id", mailboxId).eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
      if (!credential) return NextResponse.json({ error: "Mailbox credentials are unavailable. Reconnect this account." }, { status: 409 });
      const { error } = await supabase.from("user_mailbox_preferences").upsert({
        workspace_id: workspaceId, user_id: user.id, mailbox_id: mailboxId, updated_at: new Date().toISOString()
      }, { onConflict: "workspace_id,user_id" });
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        workspace_id: workspaceId, actor_id: user.id, event_type: "mailbox.selected",
        entity_type: "mailbox", entity_id: mailboxId, metadata: { provider: mailbox.provider, email: mailbox.email }
      });
      return NextResponse.json({ success: true });
    }

    if (action === "disconnect") {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase.from("mailboxes")
        .update({ active: false, revoked_at: now }).eq("id", mailboxId)
        .eq("workspace_id", workspaceId).eq("connected_by", user.id);
      if (updateError) throw updateError;
      await supabase.from("mailbox_credentials").delete().eq("mailbox_id", mailboxId)
        .eq("workspace_id", workspaceId).eq("user_id", user.id);
      await supabase.from("user_mailbox_preferences").delete().eq("workspace_id", workspaceId)
        .eq("user_id", user.id).eq("mailbox_id", mailboxId);
      await supabase.from("audit_logs").insert({
        workspace_id: workspaceId, actor_id: user.id, event_type: "mailbox.disconnected",
        entity_type: "mailbox", entity_id: mailboxId, metadata: { provider: mailbox.provider, email: mailbox.email }
      });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Action must be select or disconnect." }, { status: 400 });
  } catch (error) {
    console.error("mailbox action failed", error);
    return NextResponse.json({ error: "Could not update mailbox settings." }, { status: 500 });
  }
}
