# Telegram Mini App Migration Plan

## Product direction

Telegram is the primary user-facing product. The Telegram bot is the entry point and notification/control layer; the Telegram Mini App is the full workspace UI. The existing website remains available during migration as an administrative and recovery surface, then becomes admin-only/fallback after parity and security checks.

## Current implementation findings

- The current Next.js app uses Supabase email/password sessions for the web UI.
- The dashboard in `app/page.tsx` manages campaigns, prospects, drafts, approvals, invitations and Telegram linking.
- The existing Telegram webhook is at `app/api/telegram/webhook/route.ts`. It validates Telegram's webhook secret, links accounts with a short-lived one-time code, and supports company research, mailbox selection and other bot commands.
- The existing link-code endpoint is `app/api/telegram/link-code/route.ts`; today it requires an authenticated Supabase web session.
- Gmail/Outlook OAuth already uses state + PKCE, stores provider credentials encrypted, and redirects to the web app's `/mailboxes` page after consent.
- Email sending is disabled by default and must remain disabled throughout this migration.

## Target experience

1. User opens the bot and taps **Open Outreach Agent**.
2. Telegram launches the Mini App.
3. The Mini App sends Telegram's signed `initData` to a server endpoint. The server validates the HMAC, freshness and replay constraints before trusting the Telegram user ID.
4. The server resolves the Telegram account to an existing workspace membership, or routes an unlinked user through a secure invitation/account-linking flow.
5. The Mini App displays workspace-scoped campaigns, prospects, research, mailbox connections, drafts and approvals.
6. Gmail/Outlook connection remains a separate provider OAuth flow. The OAuth callback returns the user to a Telegram deep link / Mini App route after successful consent.
7. Bot messages notify users about events and provide deep links into the relevant Mini App screen.

## Authentication design gate

Do not treat Telegram `initData` as a Supabase access token. Do not trust a client-supplied Telegram user ID, username or chat ID. Do not expose the Supabase service-role key to the Mini App.

Before broad UI migration, implement and review a server-side authentication bridge that:
- validates Telegram Web App `initData` using Telegram's documented HMAC procedure and a strict authentication-age limit;
- binds the validated Telegram identity to the existing `telegram_accounts` and `workspace_members` records;
- creates a short-lived, revocable application session without weakening workspace isolation or bypassing row-level security;
- supports invitation-only onboarding and account recovery;
- prevents replay, session fixation, cross-workspace access and Telegram account reassignment attacks.

Prefer preserving Supabase Auth/RLS semantics. If a secure bridge cannot be implemented without changing the authorization model, stop and propose the smallest safe schema/auth change before proceeding. Never use an unverified custom JWT or service-role-only data access as a shortcut.

## Migration phases

### Phase 0 — Baseline and security review
- Record current branch, migrations, CI and Preview state.
- Audit workspace authorization helpers, RLS policies, Telegram account/link tables, invitation flow and OAuth callback routing.
- Keep the current draft approval and mailbox ownership rules intact.

### Phase 1 — Telegram Mini App foundation
- Add Telegram Web App SDK integration and a responsive mobile-first shell.
- Add bot menu button / `web_app` launch button pointing to the Preview Mini App.
- Implement server-side `initData` validation and the approved session bridge.
- Add tests for signature validation, stale/replayed initData, unlinked users and workspace isolation.

### Phase 2 — Core workspace screens
- Dashboard and activity.
- Prospects and company research.
- Campaigns.
- Draft editor and explicit approve/reject actions.
- Mailbox list and selected sender.
- Settings, workspace members and invitations (role-gated).

### Phase 3 — OAuth and bot notifications
- Keep Google/Microsoft OAuth state + PKCE and encrypted token storage.
- Return to a Mini App deep link after callback; provide a safe browser fallback.
- Notify the correct Telegram user about drafts awaiting approval and connection/send status.
- Do not send email without an explicit approved draft, the creator's selected mailbox and the existing one-shot send guard.

### Phase 4 — Parity, hardening and transition
- Verify every screen/action against existing workspace authorization and RLS.
- Test on Telegram iOS and Android clients.
- Keep website available as fallback/admin until Mini App parity is verified.
- Only then consider restricting the website to administration and fallback use.

## Non-negotiable safety constraints

- Work only on `feat/telegram-mini-app` based on `feat/outreach-agent-2-architecture`.
- Use the staging Supabase project and Vercel Preview only.
- Do not merge, promote or deploy to Production without explicit approval.
- Do not enable outbound email or send real messages during migration.
- Never commit OAuth secrets, Supabase service-role keys, Telegram bot tokens or encryption keys.
- Preserve human approval, per-user mailbox binding, encrypted credentials, audit logging and workspace isolation.

## Acceptance criteria

- An invited user can open the bot, launch the Mini App and securely reach only their own authorized workspace.
- No email/password website login is required for normal Telegram use once the approved invitation/linking flow is complete.
- Campaigns, prospects, drafts and mailbox state are consistent between Mini App and the temporary web fallback.
- Gmail OAuth returns to the Mini App without losing or weakening OAuth state/PKCE protections.
- Draft approval remains explicit and email sending remains disabled until a separately approved, controlled test.
- CI typecheck, tests and production build pass on the feature branch.
