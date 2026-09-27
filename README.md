# Outreach Agent

A GitHub-powered personal outreach agent that uses Supabase for state and your own mailbox for email delivery.

## Architecture

GitHub Actions runs the agent on demand or on a schedule.

**Drafting**
`GitHub Actions → prospects → AI draft → Supabase`

**Sending**
`You approve → GitHub Actions → your mail provider → recipient`

**Replies**
`Your mailbox → GitHub Actions → Supabase thread → response draft`

The mail layer is provider-independent. Gmail or Outlook can be used through their supported APIs/OAuth flows. AgentMail remains an optional provider rather than the primary mailbox.

## GitHub Actions

- `.github/workflows/generate-outreach.yml` — scheduled/manual draft generation.
- `.github/workflows/send-approved.yml` — manual sending of approved drafts.
- `.github/workflows/check-replies.yml` — reply synchronization every 30 minutes.

## Required GitHub Actions secrets

`SUPABASE_URL`
`SUPABASE_SERVICE_ROLE_KEY`
`MAIL_PROVIDER`
`MAIL_CLIENT_ID`
`MAIL_CLIENT_SECRET`
`MAIL_REFRESH_TOKEN`

**Never commit these values to the repository.**

## Safety

The initial production mode is **human approval required**. The send workflow is intentionally separate from draft generation and should only send records explicitly marked approved in Supabase.

## Database

Supabase stores campaigns, prospects, drafts, email threads, activities and mailboxes with row-level security.

## Local development

```bash
npm install
npm run dev
```
