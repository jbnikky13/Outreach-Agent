import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    text?: string;
    from?: { id?: number };
    chat?: { id?: number; type?: string };
  };
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function reply(chatId: number, text: string, replyMarkup?: unknown) {
  const token = required("TELEGRAM_BOT_TOKEN");
  const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
  });
  if (!response.ok) throw new Error("Telegram sendMessage failed: " + response.status);
}

async function researchCompanies(supabase: any, workspaceId: string, userId: string, query: string): Promise<{ companies: any[]; sources: string[] }> {
  const apiKey = required("GEMINI_API_KEY");
  const prompt = [
    "Research companies relevant to this business-development search using current public web sources.",
    "Return JSON only with shape {companies:[{company_name,website,industry,headquarters,description,contact_email,contact_page_url,contact_channels}]}",
    "Return up to 5 companies. Use official company domains and official contact channels when possible.",
    "Do not invent emails, phone numbers, addresses, executives, or URLs. Use null when unverified.",
    "Do not claim a company is seeking partnerships unless a source explicitly supports that.",
    "Search query: " + query
  ].join("\n");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error("Company research provider failed (" + response.status + ")");
  const raw = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("\n");
  if (typeof raw !== "string") throw new Error("Company research returned no structured result.");
  const parsed = JSON.parse(raw);
  const grounding = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = grounding.map((chunk: any) => chunk.web?.uri).filter((url: unknown): url is string => typeof url === "string" && url.startsWith("https://"));
  const rows = Array.isArray(parsed.companies) ? parsed.companies.slice(0, 5) : [];
  const saved: any[] = [];
  for (const company of rows) {
    if (typeof company.company_name !== "string" || !company.company_name.trim()) continue;
    const website = typeof company.website === "string" && company.website.startsWith("https://") ? company.website : null;
    const contactPage = typeof company.contact_page_url === "string" && company.contact_page_url.startsWith("https://") ? company.contact_page_url : null;
    const { data, error } = await supabase.from("company_research").insert({
      workspace_id: workspaceId,
      company_name: company.company_name.trim().slice(0, 200),
      website,
      industry: typeof company.industry === "string" ? company.industry.slice(0, 200) : null,
      headquarters: typeof company.headquarters === "string" ? company.headquarters.slice(0, 200) : null,
      description: typeof company.description === "string" ? company.description.slice(0, 1200) : null,
      contact_email: typeof company.contact_email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.contact_email) ? company.contact_email : null,
      contact_page_url: contactPage,
      contact_channels: company.contact_channels && typeof company.contact_channels === "object" ? company.contact_channels : {},
      source_urls: sources,
      research_status: "needs_review",
      research_query: query.slice(0, 500),
      created_by: userId
    }).select("id,company_name,website,industry,contact_email,contact_page_url,research_status").single();
    if (!error && data) saved.push(data);
  }
  return { companies: saved, sources };
}

export async function POST(request: Request) {
  try {
    const expectedSecret = required("TELEGRAM_WEBHOOK_SECRET");
    if (expectedSecret.length < 32) throw new Error("TELEGRAM_WEBHOOK_SECRET must be at least 32 characters");
    const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!safeEqual(suppliedSecret, expectedSecret)) return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });

    const update = await request.json() as TelegramUpdate;
    const message = update.message;
    const chatId = message?.chat?.id;
    const telegramUserId = message?.from?.id;
    const text = message?.text?.trim() ?? "";
    if (!message || typeof chatId !== "number" || typeof telegramUserId !== "number") return NextResponse.json({ ok: true });
    if (message.chat?.type !== "private") {
      await reply(chatId, "For account security, link and use Outreach Agent in a private chat with this bot.");
      return NextResponse.json({ ok: true });
    }

    if (/^\/start(?:\s|$)/i.test(text)) {
      const miniAppUrl = new URL("/mini-app", required("APP_BASE_URL")).toString();
      await reply(
        chatId,
        "Welcome to Outreach Agent. Open your workspace below. If your Telegram account is not linked yet, contact your workspace administrator.",
        { inline_keyboard: [[{ text: "Open Outreach Agent", web_app: { url: miniAppUrl } }]] }
      );
      return NextResponse.json({ ok: true });
    }

    const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const linkMatch = text.match(/^\/link(?:@\w+)?\s+([A-Za-z0-9_-]{24,128})$/i);
    if (linkMatch) {
      const codeHash = createHash("sha256").update(linkMatch[1]).digest("hex");
      const { error } = await supabase.rpc("redeem_telegram_link_code", {
        p_code_hash: codeHash, p_telegram_user_id: telegramUserId, p_telegram_chat_id: chatId
      });
      await reply(chatId, error
        ? "That link code is invalid, expired, already used, or your Telegram account is already linked. Generate a fresh code."
        : "Your Telegram account is now securely linked. Send /help to see what I can do.");
      return NextResponse.json({ ok: true });
    }

    const { data: account, error: accountError } = await supabase.from("telegram_accounts")
      .select("workspace_id,user_id").eq("telegram_user_id", telegramUserId).maybeSingle();
    if (accountError || !account) {
      await reply(chatId, "Your Telegram account is not linked. Sign in to Outreach Agent, generate a link code in Settings, then send /link YOUR_CODE.");
      return NextResponse.json({ ok: true });
    }
    const { data: membership } = await supabase.from("workspace_members")
      .select("role").eq("workspace_id", account.workspace_id).eq("user_id", account.user_id).maybeSingle();
    if (!membership) {
      await reply(chatId, "Your workspace membership is no longer active. Contact the workspace administrator.");
      return NextResponse.json({ ok: true });
    }

    if (/^\/connectmail(?:@\w+)?$/i.test(text)) {
      const base = required("APP_BASE_URL");
      const connectUrl = new URL("/mailboxes", base);
      await reply(chatId, "Connect your own Gmail or Outlook account here. Open the link, sign in with your Outreach Agent account, and complete the provider authorization:\n" + connectUrl.toString() + "\n\nYour mailbox is private to your account. Connecting it does not send email.");
      return NextResponse.json({ ok: true });
    }

    if (/^\/mailboxes(?:@\w+)?$/i.test(text)) {
      const { data: rows, error } = await supabase.from("mailboxes")
        .select("id,provider,email,active,revoked_at")
        .eq("workspace_id", account.workspace_id).eq("connected_by", account.user_id)
        .order("created_at", { ascending: false }).limit(10);
      const { data: preference } = await supabase.from("user_mailbox_preferences")
        .select("mailbox_id").eq("workspace_id", account.workspace_id).eq("user_id", account.user_id).maybeSingle();
      if (error) {
        await reply(chatId, "Could not load your mailboxes. Try again later.");
      } else if (!rows?.length) {
        await reply(chatId, "You have no connected mailboxes yet. Use /connectmail to connect your own Gmail or Outlook account.");
      } else {
        await reply(chatId, rows.map((row: any) =>
          (row.provider === "gmail" ? "Gmail" : "Outlook") + ": " + row.email +
          (row.active && !row.revoked_at ? "" : " (disconnected)") +
          (preference?.mailbox_id === row.id ? " — SELECTED" : "") +
          "\nID: " + row.id
        ).join("\n\n") + "\n\nUse /selectmail MAILBOX_ID to choose your sender.");
      }
      return NextResponse.json({ ok: true });
    }

    const selectMailboxMatch = text.match(/^\/selectmail(?:@\w+)?\s+([0-9a-f-]{36})$/i);
    if (selectMailboxMatch) {
      const mailboxId = selectMailboxMatch[1];
      const { data: mailbox } = await supabase.from("mailboxes")
        .select("id,provider,email,active,revoked_at").eq("id", mailboxId)
        .eq("workspace_id", account.workspace_id).eq("connected_by", account.user_id).maybeSingle();
      if (!mailbox || !mailbox.active || mailbox.revoked_at) {
        await reply(chatId, "That mailbox is unavailable or disconnected. Use /mailboxes to see your active accounts.");
        return NextResponse.json({ ok: true });
      }
      const { data: credential } = await supabase.from("mailbox_credentials").select("mailbox_id")
        .eq("mailbox_id", mailboxId).eq("workspace_id", account.workspace_id).eq("user_id", account.user_id).maybeSingle();
      if (!credential) {
        await reply(chatId, "That mailbox has no valid stored credentials. Reconnect it using /connectmail.");
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase.from("user_mailbox_preferences").upsert({
        workspace_id: account.workspace_id, user_id: account.user_id,
        mailbox_id: mailboxId, updated_at: new Date().toISOString()
      }, { onConflict: "workspace_id,user_id" });
      if (error) {
        await reply(chatId, "Could not select that mailbox. Please try again.");
      } else {
        await supabase.from("audit_logs").insert({
          workspace_id: account.workspace_id, actor_id: account.user_id,
          event_type: "mailbox.selected", entity_type: "mailbox", entity_id: mailboxId,
          metadata: { provider: mailbox.provider, email: mailbox.email, source: "telegram" }
        });
        await reply(chatId, "Selected sender: " + mailbox.email + ". New drafts will be bound to this mailbox. Sending is still disabled pending final safety checks.");
      }
      return NextResponse.json({ ok: true });
    }

    if (/^\/help(?:@\w+)?$/i.test(text)) {
      await reply(chatId, [
        "Outreach Agent commands:",
        "/workspace — show your linked workspace",
        "/profile Name | website | industry | headquarters | contact email | description — save your company profile",
        "/research <industry, location, or target> — find companies using public web sources",
        "/companies — list recent company research",
        "/contact <company-research-id> <https://contact-page> | details — prepare a contact-form task",
        "/tasks — list contact tasks awaiting review",
        "Research and form details are saved as unverified until a human checks them. The bot does not auto-submit forms or send email.",
        "/connectmail — open secure Gmail/Outlook connection settings",
        "/mailboxes — list your connected mailboxes",
        "/selectmail <mailbox-id> — choose your sender mailbox"
      ].join("\n"));
      return NextResponse.json({ ok: true });
    }

    if (/^\/workspace(?:@\w+)?$/i.test(text)) {
      const { data: workspace } = await supabase.from("workspaces").select("name").eq("id", account.workspace_id).maybeSingle();
      await reply(chatId, "Workspace: " + (workspace?.name ?? "Linked workspace") + "\nYour role: " + membership.role);
      return NextResponse.json({ ok: true });
    }

    const profileMatch = text.match(/^\/profile(?:@\w+)?\s+([\s\S]{3,1800})$/i);
    if (profileMatch) {
      if (!["owner", "admin", "member"].includes(membership.role)) {
        await reply(chatId, "Your workspace role can review company details but cannot edit the profile.");
        return NextResponse.json({ ok: true });
      }
      const fields = profileMatch[1].split("|").map(value => value.trim());
      if (fields.length < 5 || !fields[0]) {
        await reply(chatId, "Use: /profile Company name | https://website | industry | headquarters | contact email | short description");
        return NextResponse.json({ ok: true });
      }
      const [companyName, websiteRaw, industry, headquarters, emailRaw, description] = fields;
      const website = websiteRaw ? new URL(websiteRaw).toString() : null;
      if (website && new URL(website).protocol !== "https:") {
        await reply(chatId, "Company website must use HTTPS.");
        return NextResponse.json({ ok: true });
      }
      const contactEmail = emailRaw || null;
      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        await reply(chatId, "That contact email does not look valid.");
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase.from("company_profiles").upsert({
        workspace_id: account.workspace_id,
        company_name: companyName.slice(0, 200),
        website,
        industry: industry || null,
        headquarters: headquarters || null,
        contact_email: contactEmail,
        description: description || null,
        updated_at: new Date().toISOString()
      }, { onConflict: "workspace_id" });
      await reply(chatId, error
        ? "Could not save the company profile. Please try again or ask an administrator."
        : "Company profile saved. Contact-form tasks can now use these details. Send /profile again to update them.");
      return NextResponse.json({ ok: true });
    }

    const researchMatch = text.match(/^\/research(?:@\w+)?\s+([\s\S]{3,400})$/i);
    if (researchMatch) {
      if (!["owner", "admin", "member"].includes(membership.role)) {
        await reply(chatId, "Your workspace role can review research but cannot create it.");
        return NextResponse.json({ ok: true });
      }
      await reply(chatId, "Researching companies for: " + researchMatch[1].slice(0, 250) + "\nI will save sourced results for review.");
      const result = await researchCompanies(supabase, account.workspace_id, account.user_id, researchMatch[1]);
      if (!result.companies.length) {
        await reply(chatId, "I couldn't save verified company records for that search. Try a narrower query.");
      } else {
        const summary = result.companies.map((c: any, i: number) =>
          (i + 1) + ". " + c.company_name + (c.website ? "\n" + c.website : "") +
          (c.contact_page_url ? "\nContact: " + c.contact_page_url : "") +
          "\nID: " + c.id + " · needs review"
        ).join("\n\n");
        await reply(chatId, "Found " + result.companies.length + " company record(s):\n\n" + summary +
          (result.sources.length ? "\n\nResearch sources:\n" + result.sources.slice(0, 8).join("\n") : ""));
      }
      return NextResponse.json({ ok: true });
    }

    if (/^\/companies(?:@\w+)?$/i.test(text)) {
      const { data } = await supabase.from("company_research").select("id,company_name,website,research_status")
        .eq("workspace_id", account.workspace_id).order("created_at", { ascending: false }).limit(8);
      await reply(chatId, data?.length ? data.map((c: any) => c.company_name + " [" + c.research_status + "]\n" + (c.website ?? "No verified website") + "\nID: " + c.id).join("\n\n") : "No company research yet. Try /research <industry or target>.");
      return NextResponse.json({ ok: true });
    }

    const contactMatch = text.match(/^\/contact(?:@\w+)?\s+([0-9a-f-]{36})\s+(https:\/\/\S+?)(?:\s+\|\s+([\s\S]{3,1500}))?$/i);
    if (contactMatch) {
      if (!["owner", "admin", "member"].includes(membership.role)) {
        await reply(chatId, "Your workspace role can review contact tasks but cannot create them.");
        return NextResponse.json({ ok: true });
      }
      const formUrl = new URL(contactMatch[2]);
      if (formUrl.protocol !== "https:") {
        await reply(chatId, "Only HTTPS contact-form URLs are accepted.");
        return NextResponse.json({ ok: true });
      }
      const { data: company } = await supabase.from("company_research").select("id,company_name,contact_page_url")
        .eq("id", contactMatch[1]).eq("workspace_id", account.workspace_id).maybeSingle();
      if (!company) {
        await reply(chatId, "Company research record not found in your workspace.");
        return NextResponse.json({ ok: true });
      }
      const { data: profile } = await supabase.from("company_profiles")
        .select("company_name,website,industry,description,headquarters,contact_email")
        .eq("workspace_id", account.workspace_id).maybeSingle();
      const values: Record<string, unknown> = profile ? {
        company_name: profile.company_name, website: profile.website, industry: profile.industry,
        description: profile.description, headquarters: profile.headquarters, contact_email: profile.contact_email
      } : {};
      const userProvidedDetails = contactMatch[3]?.trim();
      if (userProvidedDetails) values.additional_context = userProvidedDetails;
      const { data: task, error } = await supabase.from("contact_form_tasks").insert({
        workspace_id: account.workspace_id, company_research_id: company.id, form_url: formUrl.toString(),
        purpose: userProvidedDetails ? userProvidedDetails.slice(0, 180) : "Company contact form outreach", proposed_values: values,
        field_hints: [], status: "needs_review", created_by: account.user_id
      }).select("id").single();
      const proposedPreview = Object.entries(values)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => key + ": " + String(value).slice(0, 220))
        .join("\n");
      await reply(chatId, error || !task
        ? "Could not prepare the contact form task."
        : "Contact-form task prepared for " + company.company_name + ".\nURL: " + formUrl.toString() +
          "\nTask ID: " + task.id + "\n\nProposed details:\n" + (proposedPreview || "No company profile details configured.") +
          "\\n\\nStatus: needs review. Verify each field and submit manually.");
      return NextResponse.json({ ok: true });
    }

    if (/^\/tasks(?:@\w+)?$/i.test(text)) {
      const { data } = await supabase.from("contact_form_tasks").select("id,form_url,purpose,status,created_at")
        .eq("workspace_id", account.workspace_id).in("status", ["needs_review", "approved_for_manual_entry"])
        .order("created_at", { ascending: false }).limit(8);
      await reply(chatId, data?.length ? data.map((t: any) => t.purpose + " [" + t.status + "]\n" + t.form_url + "\nID: " + t.id).join("\n\n") : "No contact-form tasks awaiting review.");
      return NextResponse.json({ ok: true });
    }

    await reply(chatId, "I didn't recognize that command. Send /help for available commands.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
