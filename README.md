# Outreach Agent

A workspace-scoped outreach assistant built with Next.js, Supabase, Telegram and per-member Gmail/Outlook connections.

## Current workflow

1. A workspace owner invites members. There is no public signup.
2. Members link their Telegram account using a short-lived, single-use code.
3. Each member connects and selects their own Gmail or Outlook mailbox.
4. Members manage campaigns and prospects in the web app.
5. The app can generate a draft from workspace campaign and prospect information.
6. A workspace member explicitly approves the stored draft.
7. Sending is guarded by the approval record, the draft creator's selected mailbox, provider identity verification and a one-shot send claim.

Company research and contact-form preparation are available through Telegram. Research results are stored as leads requiring human verification. Contact-form tasks are prepared for manual review; the bot does not submit forms.

## Safety and current limitations

- Email sending remains disabled unless `MAIL_SEND_ENABLED=true` is explicitly configured.
- Live Gmail and Microsoft OAuth connection, token refresh, identity verification and controlled send tests remain outstanding.
- Every draft must be bound to the creator's own selected mailbox. There is no global sender fallback.
- The legacy global-mailbox send, reply-sync and follow-up scripts are disabled.
- The old scheduled GitHub Actions workflows are now inert. Reply synchronization and follow-up generation must be rebuilt for per-user mailboxes before reactivation.
- Opportunity discovery beyond the current company-research workflow, document ingestion, and multi-workspace selection in the UI remain incomplete.

## Development checks

- `npm run typecheck`
- `npm test`
- `npm run build`

GitHub Actions runs these checks on pull requests. Do not put OAuth secrets, Supabase service-role keys, bot tokens or encryption keys in source control.

## Deployment status

The active implementation is being tested on `feat/outreach-agent-2-architecture` with the separate staging Supabase project. Production migrations, environment variables and deployment are not part of this branch's current test procedure.
