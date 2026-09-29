import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const provider = (process.env.MAIL_PROVIDER ?? "").toLowerCase();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

async function token(): Promise<string> {
  if (provider === "gmail") {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: required("MAIL_CLIENT_ID"),
        client_secret: required("MAIL_CLIENT_SECRET"),
        refresh_token: required("MAIL_REFRESH_TOKEN"),
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) throw new Error("Gmail token refresh failed");
    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) throw new Error("Gmail token response did not include an access token");
    return data.access_token;
  }

  if (provider === "outlook") {
    const response = await fetch(
      `https://login.microsoftonline.com/${required("MAIL_TENANT_ID")}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: required("MAIL_CLIENT_ID"),
          client_secret: required("MAIL_CLIENT_SECRET"),
          refresh_token: required("MAIL_REFRESH_TOKEN"),
          grant_type: "refresh_token",
          scope: "https://graph.microsoft.com/.default offline_access"
        })
      }
    );
    if (!response.ok) throw new Error("Outlook token refresh failed");
    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) throw new Error("Outlook token response did not include an access token");
    return data.access_token;
  }

  throw new Error("MAIL_PROVIDER must be gmail or outlook");
}

function header(
  headers: Array<{ name?: string; value?: string }>,
  name: string
): string {
  return headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

function emailFromHeader(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

async function markReply(
  prospectId: string,
  messageId: string,
  threadId: string | null,
  subject: string,
  receivedAt: string
) {
  const { data: prospect } = await supabase
    .from("prospects")
    .select("id,campaign_id")
    .eq("id", prospectId)
    .single();

  if (!prospect) return;

  const { data: existing } = await supabase
    .from("email_threads")
    .select("id")
    .eq("provider_message_id", messageId)
    .maybeSingle();

  if (existing) return;

  const { error: threadError } = await supabase.from("email_threads").upsert(
    {
      prospect_id: prospectId,
      provider,
      provider_message_id: messageId,
      provider_thread_id: threadId,
      last_message_at: receivedAt,
      last_inbound_at: receivedAt,
      awaiting_reply: false
    },
    { onConflict: "provider_message_id" }
  );

  if (threadError) throw threadError;

  const { error: prospectError } = await supabase
    .from("prospects")
    .update({
      status: "replied",
      next_follow_up_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", prospectId);

  if (prospectError) throw prospectError;

  const { error: activityError } = await supabase.from("activities").insert({
    campaign_id: prospect.campaign_id,
    prospect_id: prospectId,
    type: "reply_received",
    detail: subject || "Reply received"
  });

  if (activityError) throw activityError;

  console.log("reply matched", { prospectId, messageId, subject });
}

async function syncGmail(access: string) {
  const listResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox%20newer_than%3A7d&maxResults=50",
    { headers: { Authorization: `Bearer ${access}` } }
  );
  if (!listResponse.ok) throw new Error("Gmail inbox query failed");

  const list = (await listResponse.json()) as {
    messages?: Array<{ id: string; threadId?: string }>;
  };

  let matched = 0;

  for (const item of list.messages ?? []) {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=In-Reply-To&metadataHeaders=References`,
      { headers: { Authorization: `Bearer ${access}` } }
    );
    if (!response.ok) {
      console.error("Skipping Gmail message", item.id, await response.text());
      continue;
    }

    const message = (await response.json()) as {
      id: string;
      threadId?: string;
      internalDate?: string;
      payload?: { headers?: Array<{ name?: string; value?: string }> };
    };

    const headers = message.payload?.headers ?? [];
    const from = emailFromHeader(header(headers, "From"));
    if (!from) continue;

    const { data: prospect } = await supabase
      .from("prospects")
      .select("id")
      .ilike("email", from)
      .maybeSingle();

    if (!prospect) continue;

    await markReply(
      prospect.id,
      message.id,
      message.threadId ?? item.threadId ?? null,
      header(headers, "Subject"),
      message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : new Date().toISOString()
    );
    matched += 1;
  }

  console.log(`Gmail reply sync complete: ${list.messages?.length ?? 0} messages scanned, ${matched} new replies matched.`);
}

async function syncOutlook(access: string) {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,conversationId,receivedDateTime,subject,from,internetMessageId,internetMessageHeaders",
    { headers: { Authorization: `Bearer ${access}` } }
  );
  if (!response.ok) throw new Error("Outlook inbox query failed");

  const data = (await response.json()) as {
    value?: Array<{
      id: string;
      conversationId?: string;
      receivedDateTime?: string;
      subject?: string;
      from?: { emailAddress?: { address?: string } };
      internetMessageId?: string;
    }>;
  };

  let matched = 0;

  for (const message of data.value ?? []) {
    const from = message.from?.emailAddress?.address?.trim().toLowerCase();
    if (!from) continue;

    const { data: prospect } = await supabase
      .from("prospects")
      .select("id")
      .ilike("email", from)
      .maybeSingle();

    if (!prospect) continue;

    await markReply(
      prospect.id,
      message.internetMessageId ?? message.id,
      message.conversationId ?? null,
      message.subject ?? "Reply received",
      message.receivedDateTime ?? new Date().toISOString()
    );
    matched += 1;
  }

  console.log(`Outlook reply sync complete: ${data.value?.length ?? 0} messages scanned, ${matched} new replies matched.`);
}

async function main() {
  const access = await token();
  if (provider === "gmail") await syncGmail(access);
  else await syncOutlook(access);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
