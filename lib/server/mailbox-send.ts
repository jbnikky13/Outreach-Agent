import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptMailboxToken, encryptMailboxToken } from "./mailbox-crypto";
import { oauthConfig, type MailProvider } from "./mailbox-oauth";

type Credential = {
  mailbox_id: string;
  workspace_id: string;
  user_id: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string;
  token_expires_at: string | null;
};

export async function getFreshMailboxAccessToken(
  supabase: SupabaseClient,
  provider: MailProvider,
  credential: Credential
): Promise<string> {
  if (credential.token_expires_at && new Date(credential.token_expires_at).getTime() > Date.now() + 120_000 && credential.access_token_ciphertext) {
    return decryptMailboxToken(credential.access_token_ciphertext);
  }
  const config = oauthConfig(provider);
  if (!config.clientId || !config.clientSecret) throw new Error("Mailbox provider OAuth credentials are not configured.");
  const refreshToken = decryptMailboxToken(credential.refresh_token_ciphertext);
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const tokens = await response.json();
  if (!response.ok || typeof tokens.access_token !== "string") {
    throw new Error("Mailbox authorization expired or was revoked. Reconnect this mailbox.");
  }
  const expiresAt = typeof tokens.expires_in === "number"
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
  const { error } = await supabase.from("mailbox_credentials").update({
    access_token_ciphertext: encryptMailboxToken(tokens.access_token),
    refresh_token_ciphertext: typeof tokens.refresh_token === "string" && tokens.refresh_token
      ? encryptMailboxToken(tokens.refresh_token) : credential.refresh_token_ciphertext,
    token_expires_at: expiresAt,
    updated_at: new Date().toISOString()
  }).eq("mailbox_id", credential.mailbox_id)
    .eq("workspace_id", credential.workspace_id).eq("user_id", credential.user_id);
  if (error) throw new Error("Could not securely update mailbox credentials.");
  return tokens.access_token;
}

function validAddress(value: string) {
  return value.length <= 320 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) && !/[\r\n]/.test(value);
}

export async function sendThroughMailbox(
  provider: MailProvider,
  accessToken: string,
  recipient: string,
  subject: string,
  body: string
): Promise<{ id: string; threadId?: string }> {
  if (!validAddress(recipient)) throw new Error("Recipient email address is invalid.");
  if (!subject.trim() || /[\r\n]/.test(subject)) throw new Error("Email subject is invalid.");
  if (!body.trim()) throw new Error("Email body is empty.");

  if (provider === "gmail") {
    const mime = [
      "To: " + recipient,
      "Subject: =?UTF-8?B?" + Buffer.from(subject, "utf8").toString("base64") + "?=",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(body, "utf8").toString("base64")
    ].join("\r\n");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(mime, "utf8").toString("base64url") })
    });
    const result = await response.json();
    if (!response.ok || typeof result.id !== "string") throw new Error("Gmail did not confirm message acceptance (" + response.status + ").");
    return { id: result.id, threadId: typeof result.threadId === "string" ? result.threadId : undefined };
  }

  const createResponse = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify({
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: [{ emailAddress: { address: recipient } }]
    })
  });
  const message = await createResponse.json();
  if (!createResponse.ok || typeof message.id !== "string") {
    throw new Error("Microsoft could not create the message draft (" + createResponse.status + ").");
  }
  const sendResponse = await fetch("https://graph.microsoft.com/v1.0/me/messages/" + encodeURIComponent(message.id) + "/send", {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken }
  });
  if (sendResponse.status !== 202 && !sendResponse.ok) {
    throw new Error("Microsoft did not confirm message submission (" + sendResponse.status + ").");
  }
  return { id: message.id, threadId: typeof message.conversationId === "string" ? message.conversationId : undefined };
}
