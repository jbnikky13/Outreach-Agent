# Outreach Agent 2.0 — Staging migration notes

## Environment boundary

- Staging project: **Outreach Agent Staging**
- Supabase project ref: `xjyynmakdibnxtzunozt`
- Region: `eu-west-1`
- Production project ref: `ipitkxxlbbgmraryjlpc` — **do not use for this implementation or its tests**.

All checks in this document refer to staging unless explicitly stated otherwise. Do not copy Production service-role keys, OAuth credentials, mailbox tokens or other secrets into Preview.

## Migration history reconciliation

The staging migration ledger contains 18 applied migrations. The repository migration filenames have been aligned to the exact version and name recorded in staging:

1. `20261109151147_baseline_outreach_core_schema.sql`
2. `20261109151213_add_workspace_foundation.sql`
3. `20261109151256_bind_draft_approval.sql`
4. `20261109151306_lock_draft_approval_fields.sql`
5. `20261109151314_add_invitation_and_telegram_linking.sql`
6. `20261109155604_optimize_workspace_policies_and_indexes.sql`
7. `20261109155653_explicitly_deny_browser_access_to_service_tables.sql`
8. `20261109160208_revoke_browser_grants_on_workspace_invitations.sql`
9. `20261109160715_add_company_research_and_contact_form_tasks.sql`
10. `20261109161214_index_company_research_task_foreign_keys.sql`
11. `20261109173129_add_per_user_mailbox_foundation.sql`
12. `20261109173216_add_service_mailbox_records.sql`
13. `20261109173232_remove_unused_private_mailbox_tables.sql`
14. `20261109173307_bind_drafts_to_member_mailboxes.sql`
15. `20261109173657_add_mailbox_oauth_pkce.sql`
16. `20261109181835_add_first_owner_workspace_bootstrap.sql`
17. `20261109183158_index_mailbox_and_draft_foreign_keys.sql`
18. `20261109183427_block_draft_edits_after_send_claim.sql`

The eight original filename corrections changed repository paths only. A seventeenth forward-only migration was added to staging and the repository, adding indexes for the seven foreign keys identified by the performance advisor. An eighteenth forward-only migration updated the draft approval trigger to reject content edits after a send attempt has been claimed, preventing a concurrent edit from racing the provider send. The SQL files and resulting staging schema were inspected for the expected tables, columns, policies, bootstrap function and indexes. Supabase's migration ledger stores version/name metadata, not the original SQL text, so it cannot establish byte-for-byte identity between a historical applied SQL file and the repository copy.

**Do not reapply these 18 migrations.** Before any future schema change, compare `supabase migration list` with the staging ledger and add a new forward-only migration. Do not rewrite already-applied migration contents or change their version identifiers again.

## Implemented schema areas

- Workspace tenancy, membership roles, invitations, company profiles and audit logs.
- Workspace-scoped campaigns, prospects, drafts, threads, activities and mailbox metadata.
- Approval metadata and a database trigger that invalidates approval when draft subject/body content changes.
- Service-only invitation and Telegram linking records with server-side redemption functions.
- Company research and manual contact-form task records, with workspace RLS.
- Per-member mailbox metadata, encrypted credential records, OAuth state and PKCE verifier.
- First-owner bootstrap function restricted to `service_role`.

Mailbox credentials, OAuth state and mailbox preferences are stored in service-only tables with browser-deny RLS and revoked browser grants. Mailbox metadata writes are server-side. The application encrypts provider tokens with AES-256-GCM before persistence.

## Current staging state

At the last read-only audit:

- `auth.users`: 0
- `public.workspaces`: 0
- `public.workspace_members`: 0
- `public.workspace_invitations`: 0
- `public.telegram_accounts`: 0
- `public.mailboxes`: 0
- `public.email_drafts`: 0

The first-owner bootstrap has not been run. No owner invitation, Telegram link, mailbox connection or email send has been performed.

## Current application limitations

- The dashboard and mailbox settings currently require exactly one workspace membership per user. Multi-workspace selection is not implemented yet, although the target architecture allows multiple memberships.
- Google and Microsoft OAuth client credentials still need to be configured in the Preview environment and tested with controlled accounts.
- Telegram webhook registration and end-to-end command testing remain outstanding.
- Reply synchronization and follow-up generation using per-user mailbox credentials are not implemented. The legacy global-mailbox scripts and their scheduled workflows have been disabled on this branch.
- Email sending remains disabled unless `MAIL_SEND_ENABLED=true`; do not enable it until the controlled mailbox lifecycle is tested.
- Company research is a lead-generation aid. Results remain `needs_review`; source links are currently stored as search-level grounding sources, not independently verified evidence for every company claim.
- Document ingestion, opportunity/tender discovery, and automated form submission are not implemented.

## Staging verification checklist

1. Confirm all 16 repository migration versions/names match the staging ledger.
2. Run read-only schema, RLS, grants and function checks against staging.
3. Run Supabase security and performance advisors; review each finding rather than blindly dropping indexes.
4. Run `npm run typecheck`, `npm test` and `npm run build`.
5. Deploy the verified feature branch to the Preview environment only when deployment capacity is available.
6. Test first-owner bootstrap, invitation acceptance, Telegram linking, member isolation and mailbox OAuth using controlled test accounts.
7. Verify approval invalidation for changes to message content, recipient and sender mailbox.
8. Only after explicit authorization, test one controlled send and verify provider response and local reconciliation.

Production remains out of scope. No Production migration, environment-variable change, deployment or outbound email is authorized by this staging plan.
