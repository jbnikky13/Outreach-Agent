import { sendGmail } from "../lib/mail";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing GitHub Actions secret: ${name}`);
  return value;
}

async function main() {
  requireEnv("MAIL_CLIENT_ID");
  requireEnv("MAIL_CLIENT_SECRET");
  requireEnv("MAIL_REFRESH_TOKEN");
  const to = requireEnv("TEST_EMAIL");

  const result = await sendGmail(
    to,
    "Outreach Agent — Gmail connection test",
    "This is a controlled test email from Outreach Agent. No prospect data was used and no outreach campaign was sent."
  );

  console.log(`Test email sent successfully to ${to}. Gmail message ID: ${result.id}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
