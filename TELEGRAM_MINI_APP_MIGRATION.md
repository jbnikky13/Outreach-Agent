# Telegram Mini App Migration Plan

## Product direction

Telegram is the primary user-facing product. The Telegram bot is the entry point and notification/control layer; the Telegram Mini App is the full workspace UI. The existing website remains available during migration as an administrative and recovery surface, then becomes admin-only/fallback after parity and security checks.

## Current implementation findings (staging/repository audit)

- The current Next.js app uses Supabase email/password sessions for the web UI.
- `app/page.tsx` reads campaigns, prospects, drafts and memberships directly from Supabase in the browser. It also calls authenticated API routes for invitations, approvals, sends and Telegram linking.
- Existing API helper `lib/server/workspace-auth.ts` verifies Supabase access tokens with `auth.getUser`, then independently checks the requested workspace membership and role using the service role.
- Staging RLS policies depend on `auth.uid()` through `private.has_workspace_role`. Browser roles are explicitly denied access to Telegram identity/link-code tables, OAuth state, mailbox credentials, workspace invitations and mailbox preferences.
- The Telegram webhook validates Telegram's webhook secret, links accounts with a short-lived one-time code, and performs server-side workspace membership checks.
- The existing link-code endpoint requires a Supabase web session.
- Gmail/Outlook OAuth already uses state + PKCE, stores provider credentials encrypted, and redirects to the web app's `/mailboxes` page after consent.
- Staging security advisor returned no lints at the time of this audit. Staging tables are empty; no existing user data should be assumed for test coverage.
- Email sending is disabled by default and must remain disabled throughout this migration.

## Target experience

1. User opens the bot and taps **Open Outreach Agent**.
2. Telegram launches the Mini App.
3. The Mini App sends Telegram's signed `initData` to a server endpoint. The server validates the HMAC, freshness and replay constraints before trusting the Telegram user ID.
4. The server resolves the Telegram account to an existing workspace membership, or routes an unlinked user through a secure invitation/account-linking flow.
5. The Mini App displays workspace-scoped campaigns, prospects, research, mailbox connections, drafts and approvals.
6. Gmail/Outlook connection remains a separate provider OAuth flow. The OAuth callback returns the user to a Telegram deep link / Mini App route after consent.
7. Bot messages notify users about events and provide deep links into the relevant Mini App screen.

## Authentication and data-access decision

A Telegram `initData` payload is not a Supabase access token. The existing RLS policies use `auth.uid()`, so a Telegram identity cannot simply be passed to Supabase as an authenticated browser user.

Use a **server-side opaque session + backend-for-frontend (BFF)** for Mini App requests:
- Verify Telegram Web App `initData` on the server using Telegram's documented HMAC procedure, strict `auth_date` age, constant-time hash comparison, expected bot token and strict parsing/size limits.
- Never accept a client-supplied Telegram user ID, username, chat ID, workspace ID or role as proof of identity.
- Resolve the verified Telegram ID through `telegram_accounts`, then re-check the corresponding `workspace_members` row on session creation and on every authenticated request. Reject missing/revoked membership.
- Create a cryptographically random, short-lived opaque session token. Store only its SHA-256 hash in a server-only table. Set the raw token in a Secure, HttpOnly, SameSite cookie; never expose it to JavaScript, logs, URLs or local storage. Include expiry, revocation and last-used timestamps. Rotate on re-authentication and provide explicit logout/revocation.
- All Mini App data access must go through server BFF routes. Those routes authenticate the opaque session, derive user/workspace/role from server-side records, and enforce the same role matrix as the current APIs before using service-role database access. The Mini App must never receive a service-role key.
- Do not make the opaque session look like a Supabase JWT and do not pass it to Supabase Auth. Keep existing Supabase browser/RLS access for the temporary website.
- Migrate browser-direct Supabase reads/writes in the dashboard to BFF endpoints before Mini App use. This is required because the RLS policies intentionally reject anonymous browser access and cannot infer `auth.uid()` from Telegram.
- Keep service-only tables denied to browser roles. Do not add permissive RLS policies to make the Mini App work.
- Add rate limits to initData exchange and session creation; use a unique exchange/replay record so a captured initData payload cannot be exchanged repeatedly. Handle safe retries deliberately rather than silently weakening replay controls.
- A Telegram account must be linked through the existing one-time, expiring link-code flow or a verified invitation/onboarding process. Do not auto-link by username or email claim from the client.
- Provide a recovery route for lost/replaced Telegram accounts that requires an existing authenticated account/admin intervention; do not allow self-service reassignment based only on Telegram username.

This BFF model intentionally keeps the existing Supabase RLS boundary for direct browser clients while introducing a separate, explicit server authorization boundary for Telegram sessions. Every BFF handler must check membership and role; service-role use must remain server-only and narrowly scoped.

## Migration phases

### Phase 0 — Baseline and security review
- Record current branch, migrations, CI and Preview state.
- Audit workspace authorization helpers, RLS policies, Telegram account/link tables, invitation flow and OAuth callback routing.
- Keep the current draft approval and mailbox ownership rules intact.

### Phase 1 — Telegram Mini App foundation
- Add Telegram Web App SDK integration and a responsive mobile-first shell.
- Add bot menu button / `web_app` launch button pointing to the Preview Mini App.
- Implement and test signed initData validation, replay-resistant exchange, opaque cookie sessions, logout/revocation and server-side workspace/role checks.
- Add tests for invalid signature, altered payload, stale auth_date, replay, missing account link, revoked membership, cross-workspace attempts, cookie flags and role denial.
- Do not add database policies that grant Telegram browser access.

### Phase 2 — BFF and core workspace screens
- Build typed BFF routes for dashboard data, campaigns, prospects, company research, drafts, activities, mailboxes and settings.
- Migrate the dashboard's direct browser Supabase queries to the BFF while retaining the website's existing Supabase-auth path.
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
