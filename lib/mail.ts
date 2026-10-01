type Provider = "gmail" | "outlook";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

async function gmailToken() {
  const body = new URLSearchParams({
    client_id: required("MAIL_CLIENT_ID"),
    client_secret: required("MAIL_CLIENT_SECRET"),
    refresh_token: required("MAIL_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) { const errorBody = await r.text(); throw new Error(`Gmail token refresh failed (${r.status}): ${errorBody}`); }
  const data = (await r.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail token response did not include an access token");
  return data.access_token;
}

function b64url(s: string) {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mimeWord(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value.normalize("NFC"), "utf8").toString("base64")}?=`;
}

function normalizeMailText(value: string): string {
  return value.normalize("NFC").replace(/\r?\n/g, "\r\n");
}

export async function sendGmail(to: string, subject: string, text: string) {
  const token = await gmailToken();
  const from = required("MAIL_FROM_ADDRESS").toLowerCase();

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!profileResponse.ok) {
    throw new Error(`Unable to verify the authorized Gmail mailbox (${profileResponse.status}): ${await profileResponse.text()}`);
  }

  const profile = (await profileResponse.json()) as { emailAddress?: string };
  const authorizedMailbox = profile.emailAddress?.trim().toLowerCase();
  if (!authorizedMailbox) throw new Error("Gmail API did not return the authorized mailbox address");

  if (authorizedMailbox !== from) {
    throw new Error(
      `MAIL_FROM_ADDRESS (${from}) does not match the Gmail OAuth mailbox (${authorizedMailbox}). Re-authorize the intended Gmail account or correct MAIL_FROM_ADDRESS.`
    );
  }

  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${mimeWord(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(normalizeMailText(text), "utf8").toString("base64"),
  ].join("\r\n");

  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(raw) }),
  });
  if (!r.ok) { const errorBody = await r.text(); throw new Error(`Gmail send failed (${r.status}): ${errorBody}`); }
  return (await r.json()) as { id: string; threadId?: string };
}

async function outlookToken() {
  const body = new URLSearchParams({
    client_id: required("MAIL_CLIENT_ID"),
    client_secret: required("MAIL_CLIENT_SECRET"),
    refresh_token: required("MAIL_REFRESH_TOKEN"),
    grant_type: "refresh_token",
    scope: "https://graph.microsoft.com/.default offline_access",
  });
  const r = await fetch(`https://login.microsoftonline.com/${required("MAIL_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("Outlook token refresh failed: " + await r.text());
  const data = (await r.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Outlook token response did not include an access token");
  return data.access_token;
}

export async function sendOutlook(to: string, subject: string, text: string): Promise<{ id: string; threadId?: string }> {
  const token = await outlookToken();
  const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: subject.normalize("NFC"),
        toRecipients: [{ emailAddress: { address: to } }],
        body: { contentType: "Text", content: normalizeMailText(text) },
      },
    }),
  });
  if (!r.ok) throw new Error("Outlook send failed: " + await r.text());
  return { id: "outlook-" + Date.now(), threadId: undefined };
}

export async function sendMail(to: string, subject: string, text: string) {
  const provider = (process.env.MAIL_PROVIDER ?? "").toLowerCase() as Provider;
  if (provider === "gmail") return sendGmail(to, subject, text);
  if (provider === "outlook") return sendOutlook(to, subject, text);
  throw new Error("MAIL_PROVIDER must be gmail or outlook");
}
