# Per-user mailbox OAuth setup

The mailbox integration uses each signed-in workspace member's own Gmail or Microsoft account. OAuth refresh tokens and access tokens are encrypted with AES-256-GCM before they are stored. No provider-wide sender account is used as a fallback.

## Preview environment variables

Set these on the Vercel Preview environment for branch `feat/outreach-agent-2-architecture` only:

- `MAILBOX_TOKEN_ENCRYPTION_KEY`: already generated and added as a sensitive Preview-only variable. Keep it backed up securely; losing it makes stored mailbox credentials undecryptable.
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`
- `MICROSOFT_OAUTH_TENANT_ID` (optional; defaults to `common`).
- `MAIL_SEND_ENABLED`: leave unset or set to `false` during testing. Do not enable until a controlled test mailbox and send/reconciliation checks have passed.

Do not add these values to GitHub, source files, chat messages, or production variables. The client ID is not a password, but keep the client secret private.

## Google OAuth client

1. Create an OAuth 2.0 Web application client in Google Cloud Console.
2. Configure the consent screen and add test users while the app is in Testing.
3. Add this exact Authorized redirect URI, using the branch's stable Preview alias configured in `APP_BASE_URL`:

   `{APP_BASE_URL}/api/mailboxes/oauth/callback/gmail`

4. Add the client ID and client secret to the Preview branch environment.
5. The app requests OpenID identity and `gmail.send`. Google may require verification before general external users can authorize a restricted/sensitive scope. Keep the OAuth app in testing until its consent and verification requirements are resolved.

## Microsoft OAuth app

1. Register an application in Microsoft Entra ID.
2. Configure a Web platform redirect URI:

   `{APP_BASE_URL}/api/mailboxes/oauth/callback/outlook`

3. Enable the account types required for the pilot (the default tenant setting in the app is `common`).
4. Add delegated Microsoft Graph permissions: `User.Read`, `Mail.ReadWrite`, and `Mail.Send`, plus OpenID scopes and `offline_access`.
5. Grant consent as required by the tenant's policy.
6. Add the application client ID, client secret, and optional tenant ID to the Preview branch environment.

## Connect and select

1. Sign in to the Preview app.
2. Open Settings → Manage my mailboxes, or use Telegram `/connectmail`.
3. Choose Gmail or Outlook and complete the provider consent flow.
4. Confirm the displayed email address is the intended account.
5. Select the sender in the mailbox list. Telegram users can also use `/mailboxes` and `/selectmail MAILBOX_ID`.

OAuth state is random, hashed before storage, expires after ten minutes, and is single-use. Authorization uses PKCE (S256). Callback URLs are derived from the configured `APP_BASE_URL`; do not use temporary deployment URLs for provider redirect registration.

## Sending controls

Sending remains disabled unless `MAIL_SEND_ENABLED=true` is explicitly configured. Do not enable this on Preview until the provider connection, mailbox ownership checks, approval-hash validation, one-shot send claim, provider response handling, and reconciliation procedure have been tested with a mailbox controlled by the tester. The legacy global-mailbox batch and Gmail self-test scripts are disabled.
