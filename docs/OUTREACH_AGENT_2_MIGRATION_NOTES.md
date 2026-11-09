# Workspace foundation migration notes

## Scope

This is the first repository-tracked, forward-only workspace migration for Outreach-Agent 2.0. It adds workspaces, workspace memberships, invitation records, company profiles and audit logs, then adds a non-null `workspace_id` to the six existing outreach tables.

The migration preserves all existing records and their existing `owner_id` values. Existing users are assigned a personal legacy workspace and owner membership. Missing owner IDs on email threads and activities are recovered only from their linked prospect/campaign. If any existing row cannot be assigned safely, a guard raises an exception before the existing owner policies are replaced.

## Important repository/database drift

The connected Supabase project reports six applied migrations dated 2026-09-27 and 2026-09-28, but their SQL files are not present in this repository's inspected branch. This file must therefore be reconciled against the hosted migration history and a staging schema before it is applied. Do not assume this repository can yet reproduce the whole production schema from zero.

## Apply/test sequence

1. Create a staging Supabase project from a database backup/schema clone. Do not test this first on production.
2. Reconcile this SQL with the six hosted migrations and verify the six existing table definitions and policy names.
3. Apply the migration to staging.
4. Verify row counts are unchanged for campaigns (7), prospects (36), email_drafts (67), email_threads (30), and activities (52); mailboxes currently has 0 rows.
5. Verify each existing row has a workspace ID; existing owner IDs remain unchanged except the 3 ownerless email threads and 17 ownerless activities, which should inherit the linked prospect/campaign owner.
6. Test with two authenticated users in separate workspaces: cross-workspace reads/writes must return no rows; workspace members can read; reviewers cannot mutate; members cannot manage mailboxes; owners/admins can manage mailboxes.
7. Verify invitation records are inaccessible to direct client roles and are only manipulated by authenticated server handlers after explicit workspace authorization.
8. Run Supabase security/performance advisors and the application's typecheck/test/build suite.
9. Only after review and explicit production approval should this be applied to production.

## Known follow-up work

- Add server-side auth/session validation and workspace membership checks to every privileged API route before any service-role query.
- Implement invitation creation/acceptance using cryptographically random one-time tokens; store only a token hash and enforce expiry/revocation/email match.
- Add Telegram account linking via one-time authenticated code; never authorize by Telegram username/chat ID alone.
- Add mailbox credential isolation and explicit mailbox selection. The current mail adapter still uses process-wide environment credentials.
- Add company document storage/extraction and evidence provenance in a separate migration.
- Restrict authenticated browser updates on email drafts to subject/body only; a database trigger resets status and clears approval metadata whenever either field changes. Apply `20261109200000_lock_draft_approval_fields.sql` after the approval-metadata migration.\n- Email send attempts now fail closed on ambiguous provider/network outcomes: the attempt claim is retained and automatic stale-claim retries are disabled. A mailbox reconciliation procedure is still needed before safely releasing an uncertain attempt.\n- Add tests for RLS, route authorization, role restrictions, token replay, approval invalidation on edits, ambiguous send recovery, and cross-tenant isolation.

## Non-goals

This migration does not create Telegram commands, invite links, document upload flows, OAuth connections, or opportunity discovery. It does not alter live production data.


## Staging project and Telegram research workflow

Staging project: `xjyynmakdibnxtzunozt` in `eu-west-1`. The staging database has a repository-tracked baseline and the workspace, approval, invitation/Telegram, policy/index, and company research/contact-task migrations. No production rows were copied.

### Telegram commands

After a user links their Telegram account from Settings:

- `/help` — list commands.
- `/workspace` — show the linked workspace and role.
- `/research <query>` — use Gemini web grounding to research up to five companies; save findings and public source URLs with status `needs_review`.
- `/companies` — list recent research records.
- `/contact <company-research-uuid> <https-contact-page-url>` — create a contact-form task containing the workspace company profile values.
- `/tasks` — list tasks awaiting review.

Research results are leads, not verified facts. A human must validate official domains, contact details, and sources. The bot does not bypass CAPTCHA, authentication, access controls, or site restrictions. It does not submit contact forms or send email from these commands. Contact tasks are preparation records for human review and manual submission.

### Required Vercel Preview variables

For branch `feat/outreach-agent-2-architecture`, Preview variables are scoped to the branch. The public Supabase URL and publishable key point to staging. `MAIL_PROVIDER=disabled` prevents staging email sending. `APP_BASE_URL` points to the branch preview deployment.

The staging service-role variable and staging Gemini variable are intentionally set to non-secret placeholders until real staging-only values are entered. Do not replace them with production secrets. Set these securely in Vercel:
- `SUPABASE_SERVICE_ROLE_KEY`: staging project's service-role secret only.
- `GEMINI_API_KEY`: staging-specific Gemini API key.
- `TELEGRAM_BOT_TOKEN`: dedicated staging bot token.
- `TELEGRAM_WEBHOOK_SECRET`: random high-entropy secret (at least 32 characters).
- `APP_BASE_URL`: current stable preview origin.

Configure Supabase Auth Site URL and allowed redirect URL for the exact preview origin plus `/accept-invite`. Configure custom SMTP before invitation delivery tests. The staging project currently has no initial user or workspace; create the first staging auth user, then perform a controlled owner/workspace bootstrap before inviting other test users.

Never enable outbound email on staging. Do not point staging environment variables at the production Supabase project.


The current stable Vercel branch alias is `outreach-agent-git-feat-outreach-6fa427-nichole-godams-projects.vercel.app`; branch-scoped `APP_BASE_URL` is set to this alias so invitation redirects remain stable across preview redeployments.


### Telegram company profile and contact-form details

- `/profile Company name | https://website | industry | headquarters | contact email | description` saves the workspace's company profile. Members with owner/admin/member roles may update it.
- `/contact <company-research-uuid> <https-contact-page-url> | extra context` creates a contact task using the saved company profile plus the optional details after the pipe.
- The bot returns the proposed values in Telegram for review. The current implementation prepares the values and task record; it does not inspect arbitrary website HTML to map fields or automatically populate/submit remote forms.
- Manual form completion remains the safe supported workflow until a browser-based form mapper is built and tested against site terms, CAPTCHA, anti-bot controls, and field validation.
