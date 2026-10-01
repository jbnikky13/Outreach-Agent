function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing GitHub Actions secret: ${name}. Add it under Settings → Secrets and variables → Actions.`);
  return value;
}

async function main() {
  const provider = requireEnv("MAIL_PROVIDER").toLowerCase();
  if (provider !== "gmail") throw new Error(`This workflow validates Gmail only. MAIL_PROVIDER is "${provider}".`);

  const clientId = requireEnv("MAIL_CLIENT_ID");
  const clientSecret = requireEnv("MAIL_CLIENT_SECRET");
  const refreshToken = requireEnv("MAIL_REFRESH_TOKEN");
  const expectedMailbox = requireEnv("MAIL_FROM_ADDRESS").toLowerCase();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data: { access_token?: string; error?: string; error_description?: string } = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      `Gmail OAuth token exchange failed: ${data.error ?? "unknown_error"}${data.error_description ? ` — ${data.error_description}` : ""}`,
    );
  }

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });

  const profile: { emailAddress?: string; messagesTotal?: number; error?: { message?: string } } =
    await profileResponse.json();

  if (!profileResponse.ok || !profile.emailAddress) {
    throw new Error(`Gmail API validation failed: ${profile.error?.message ?? "unknown_error"}`);
  }

  const authorizedMailbox = profile.emailAddress.toLowerCase();
  if (authorizedMailbox !== expectedMailbox) {
    throw new Error(`Authorized Gmail mailbox is "${authorizedMailbox}", but MAIL_FROM_ADDRESS is "${expectedMailbox}". Re-authorize the intended Gmail account or correct the secret.`);
  }

  console.log("Gmail OAuth/API validation passed.");
  console.log(`Authorized mailbox: ${profile.emailAddress}`);
  console.log(`Messages total: ${profile.messagesTotal ?? 0}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
