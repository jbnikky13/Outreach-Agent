# Outreach Agent

A GitHub-powered personal outreach agent using Supabase for state and your own mailbox for email delivery.

## Workflow

1. Campaigns and prospects are stored in Supabase.
2. GitHub Actions generates outreach drafts.
3. You review and approve drafts.
4. The approved-send workflow sends only approved drafts through Gmail or Outlook OAuth.
5. Sent message/thread IDs are recorded in Supabase.
6. The reply-sync workflow checks the mailbox every 30 minutes.
7. Incoming replies can be matched to prospects/threads and used to stop follow-ups and prepare response drafts.

## GitHub Actions

- `.github/workflows/generate-outreach.yml` — scheduled/manual draft generation.
- `.github/workflows/send-approved.yml` — sends only explicitly approved drafts.
- `.github/workflows/check-replies.yml` — checks Gmail/Outlook inboxes every 30 minutes.

## Required GitHub Actions secrets

`SUPABASE_URL`
`SUPABASE_SERVICE_ROLE_KEY`
`MAIL_PROVIDER` — `gmail` or `outlook`
`MAIL_CLIENT_ID`
`MAIL_CLIENT_SECRET`
`MAIL_REFRESH_TOKEN`
`MAIL_TENANT_ID` — required for Outlook

Never commit secrets.

## Safety

Human approval is required before sending. The send workflow is separate from draft generation. The runner queries only drafts marked `approved` and uses provider message IDs to reduce duplicate sends.

## Database

Supabase stores campaigns, prospects, drafts, threads, activities and mailboxes with row-level security.

## Status

The GitHub automation, provider adapters, Supabase schema and mailbox polling foundation are implemented. Provider OAuth secrets still need to be configured before live Gmail/Outlook delivery can run.
