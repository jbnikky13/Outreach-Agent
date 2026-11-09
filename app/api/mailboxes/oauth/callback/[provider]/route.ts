import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encryptProviderTokens, hashOAuthState, mailboxBaseUrl, mailboxCallbackUrl, oauthConfig, safeProvider } from "../../../../../../lib/server/mailbox-oauth";

export const runtime = "nodejs";
function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}
function resultRedirect(status: "connected" | "error", message: string) {
  const url = new URL("/mailboxes", mailboxBaseUrl());
  url.searchParams.set(status, status === "connected" ? "1" : message.slice(0, 180));
  return NextResponse.redirect(url);
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  let provider: string = "";
  try {
    provider = (await context.params).provider.toLowerCase();
    if (!safeProvider(provider)) return resultRedirect("error", "Unsupported email provider.");
    const requestUrl = new URL(request.url);
    const oauthError = requestUrl.searchParams.get("error");
    if (oauthError) return resultRedirect("error", "Mailbox authorization was cancelled or denied.");
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    if (!code || !state || code.length > 4096 || state.length > 256) {
      return resultRedirect("error", "Authorization response was incomplete.");
    }

    const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const now = new Date().toISOString();
    const { data: stateRow, error: stateError } = await supabase.from("mailbox_oauth_states")
      .update({ consumed_at: now })
      .eq("state_hash", hashOAuthState(state)).eq("provider", provider)
      .is("consumed_at", null).gt("expires_at", now)
      .select("workspace_id,user_id,redirect_uri,code_verifier").maybeSingle();
    if (stateError || !stateRow || stateRow.redirect_uri !== mailboxCallbackUrl(provider)) {
      return resultRedirect("error", "This authorization link is invalid, expired, or already used. Start again from Mailboxes.");
    }

    const config = oauthConfig(provider);
    if (!config.clientId || !config.clientSecret) return resultRedirect("error", "The email provider is not configured by the administrator.");
    const tokenResponse = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: stateRow.redirect_uri,
        code_verifier: stateRow.code_verifier
      })
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || typeof tokens.access_token !== "string") {
      console.error("mailbox token exchange failed", provider, tokenResponse.status);
      return resultRedirect("error", "The email provider could not complete authorization. Please try again.");
    }
    if (typeof tokens.refresh_token !== "string" || !tokens.refresh_token) {
      return resultRedirect("error", "The provider did not issue a refresh token. Reconnect and approve offline access.");
    }

    let accountId = "";
    let email = "";
    let displayName = "";
    if (provider === "gmail") {
      const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: "Bearer " + tokens.access_token }
      });
      const profile = await response.json();
      if (!response.ok || typeof profile.sub !== "string" || typeof profile.email !== "string" || profile.email_verified !== true) {
        return resultRedirect("error", "Google did not return a verified email identity.");
      }
      accountId = profile.sub;
      email = profile.email.toLowerCase();
      displayName = typeof profile.name === "string" ? profile.name : email;
    } else {
      const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
        headers: { authorization: "Bearer " + tokens.access_token }
      });
      const profile = await response.json();
      const address = typeof profile.mail === "string" ? profile.mail : profile.userPrincipalName;
      if (!response.ok || typeof profile.id !== "string" || typeof address !== "string" || !address.includes("@")) {
        return resultRedirect("error", "Microsoft did not return a usable mailbox identity.");
      }
      accountId = profile.id;
      email = address.toLowerCase();
      displayName = typeof profile.displayName === "string" ? profile.displayName : email;
    }

    const { data: existing, error: existingError } = await supabase.from("mailboxes")
      .select("id,workspace_id,connected_by").eq("provider", provider).eq("provider_inbox_id", accountId).maybeSingle();
    if (existingError) {
      console.error("mailbox lookup failed", existingError);
      return resultRedirect("error", "Could not verify whether this mailbox is already connected.");
    }
    if (existing && (existing.workspace_id !== stateRow.workspace_id || existing.connected_by !== stateRow.user_id)) {
      return resultRedirect("error", "This provider account is already connected to another user or workspace.");
    }

    let mailboxId = existing?.id as string | undefined;
    if (mailboxId) {
      const { error } = await supabase.from("mailboxes").update({
        email, display_name: displayName, active: true, revoked_at: null, last_verified_at: now
      }).eq("id", mailboxId);
      if (error) {
        console.error("mailbox metadata update failed", error);
        return resultRedirect("error", "Could not update this mailbox connection.");
      }
    } else {
      const { data: mailbox, error } = await supabase.from("mailboxes").insert({
        owner_id: stateRow.user_id, connected_by: stateRow.user_id, workspace_id: stateRow.workspace_id,
        connection_type: "user", provider, provider_inbox_id: accountId, email,
        display_name: displayName, active: true, last_verified_at: now
      }).select("id").single();
      if (error || !mailbox) {
        console.error("mailbox metadata insert failed", error);
        return resultRedirect("error", "Could not save the mailbox connection.");
      }
      mailboxId = mailbox.id;
    }

    const encrypted = encryptProviderTokens(tokens.access_token, tokens.refresh_token);
    const expiresAt = typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
    const grantedScopes = typeof tokens.scope === "string" ? tokens.scope.split(" ").filter(Boolean) : config.scopes;
    const { error: credentialError } = await supabase.from("mailbox_credentials").upsert({
      mailbox_id: mailboxId, workspace_id: stateRow.workspace_id, user_id: stateRow.user_id,
      ...encrypted, encryption_version: 1, token_expires_at: expiresAt,
      granted_scopes: grantedScopes, updated_at: now
    }, { onConflict: "mailbox_id" });
    if (credentialError) {
      await supabase.from("mailboxes").update({ active: false }).eq("id", mailboxId);
      console.error("mailbox credential save failed", credentialError);
      return resultRedirect("error", "Mailbox identity was saved but its encrypted credentials could not be stored. Contact support before reconnecting.");
    }

    const { error: preferenceError } = await supabase.from("user_mailbox_preferences").upsert({
      workspace_id: stateRow.workspace_id, user_id: stateRow.user_id, mailbox_id: mailboxId, updated_at: now
    }, { onConflict: "workspace_id,user_id" });
    if (preferenceError) {
      console.error("mailbox preference save failed", preferenceError);
      return resultRedirect("error", "Mailbox connected, but it could not be selected automatically. Select it from Mailboxes.");
    }
    await supabase.from("audit_logs").insert({
      workspace_id: stateRow.workspace_id, actor_id: stateRow.user_id, event_type: "mailbox.connected",
      entity_type: "mailbox", entity_id: mailboxId, metadata: { provider, email }
    });
    return resultRedirect("connected", "1");
  } catch (error) {
    console.error("mailbox oauth callback failed", error);
    try { return resultRedirect("error", "Mailbox connection failed. Please start again."); }
    catch { return NextResponse.json({ error: "Mailbox connection failed." }, { status: 500 }); }
  }
}
