import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "../../../../../lib/server/workspace-auth";
import { createOAuthState, hashOAuthState, mailboxCallbackUrl, oauthConfig, safeProvider } from "../../../../../lib/server/mailbox-oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireWorkspaceAccess(request, ["owner", "admin", "member"]);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const provider = typeof body.provider === "string" ? body.provider.toLowerCase() : "";
    if (!safeProvider(provider)) return NextResponse.json({ error: "Choose Gmail or Outlook." }, { status: 400 });
    const config = oauthConfig(provider);
    if (!config.clientId || !config.clientSecret) {
      return NextResponse.json({ error: provider === "gmail"
        ? "Gmail connection is not configured yet. An administrator must add the Google OAuth client ID and secret."
        : "Outlook connection is not configured yet. An administrator must add the Microsoft OAuth client ID and secret." }, { status: 503 });
    }
    const state = createOAuthState();
    const redirectUri = mailboxCallbackUrl(provider);
    const { supabase, user, workspaceId } = access.context;
    const { error } = await supabase.from("mailbox_oauth_states").insert({
      state_hash: hashOAuthState(state), workspace_id: workspaceId, user_id: user.id,
      provider, redirect_uri: redirectUri, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });
    if (error) {
      console.error("mailbox oauth state insert failed", error);
      return NextResponse.json({ error: "Could not start secure mailbox authorization." }, { status: 500 });
    }
    const url = new URL(config.authorizationEndpoint);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", config.scopes.join(" "));
    url.searchParams.set("state", state);
    if (provider === "gmail") {
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("include_granted_scopes", "true");
    } else {
      url.searchParams.set("prompt", "select_account");
    }
    return NextResponse.json({ authorizationUrl: url.toString(), expiresIn: 600 });
  } catch (error) {
    console.error("mailbox oauth start failed", error);
    return NextResponse.json({ error: "Could not start mailbox authorization." }, { status: 500 });
  }
}
