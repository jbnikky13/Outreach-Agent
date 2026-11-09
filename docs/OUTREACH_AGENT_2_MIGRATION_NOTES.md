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
- Restrict authenticated browser updates on email drafts to subject/body only; a database trigger resets status and clears approval metadata whenever either field changes. Apply `20261109200000_lock_draft_approval_fields.sql` after the approval-metadata migration.\n- Add tests for RLS, route authorization, role restrictions, token replay, approval invalidation on edits, and cross-tenant isolation.

## Non-goals

This migration does not create Telegram commands, invite links, document upload flows, OAuth connections, or opportunity discovery. It does not alter live production data.
