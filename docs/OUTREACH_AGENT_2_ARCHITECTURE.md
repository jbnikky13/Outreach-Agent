# Outreach-Agent 2.0 — Architecture and Implementation Plan

**Status:** Architecture baseline; implementation not yet started  
**Base repository:** `jbnikky13/Outreach-Agent`  
**Base branch:** `main`  
**Working branch:** `feat/outreach-agent-2-architecture`

## 1. Product decisions

- **Access:** invitation-only. An administrator invites users; invitations are single-use, expiring, and scoped to a workspace and role.
- **Email:** support both user-connected mailboxes and administrator-managed mailboxes. A workspace must explicitly select an authorised sending mailbox for each campaign.
- **Discovery:** support potential clients, strategic partners, supplier relationships, subcontracting, public/private procurement, tenders, grants and institutional opportunities. Discovery categories must remain distinguishable in results.
- **Interface:** Telegram-first, with backend services designed to support a future web dashboard.
- **Safety:** draft-first. No message is sent without an explicit approval event by an authorised workspace member.

## 2. Existing repository audit (initial)

Verified from the default branch:

- Next.js application and Supabase browser client exist.
- Existing dashboard includes campaigns, prospects, draft review, approval and send controls.
- `lib/mail.ts` supports Gmail and Outlook using process-wide environment variables.
- `app/api/drafts/generate/route.ts`, `approve/route.ts` and `send/route.ts` exist.
- `scripts/send-approved.ts`, `scripts/check-replies.ts` and `scripts/generate-followups.ts` exist.
- `.github/workflows/generate-outreach.yml` currently contains placeholder echo commands rather than a working draft-generation runner.
- README describes reply sync and follow-up workflows.
- The inspected API handlers use a Supabase service-role client. They do not independently establish the caller's authenticated identity and workspace membership before privileged reads/writes. Frontend session checks are not a security boundary.
- The dashboard Settings view contains a hardcoded sender address; this must become mailbox/workspace data.
- The existing send and reply scripts use global mailbox environment variables and must be refactored for per-mailbox credential resolution.

**Not yet verified:** complete database schema, all migrations, all API routes, current deployed environment variables, live OAuth health, production data, and existing RLS policies. Do not write destructive migrations or claim production readiness until these are inspected.

## 3. Target architecture

### 3.1 Application layers

1. **Telegram adapter**
   - Telegram webhook, command routing, callback buttons, file upload handling and message formatting.
   - Verify Telegram webhook secret token.
   - Resolve Telegram user ID to an application user; never treat Telegram chat ID alone as workspace authorisation.
   - Keep Telegram-specific code outside domain/business logic.

2. **Identity and access**
   - Supabase Auth as the canonical application identity.
   - Invitation-only onboarding.
   - Workspace membership and roles: owner, admin, member, reviewer.
   - Expiring, single-use invitation tokens stored hashed.
   - Telegram account linking requires an authenticated one-time linking flow.
   - Support multiple members per workspace and multiple workspaces per user.

3. **Workspace-scoped domain services**
   - Company profile and capability management.
   - Document ingestion and evidence extraction.
   - Prospect and organisation research.
   - Opportunity discovery and qualification.
   - Campaigns and draft generation.
   - Mailbox selection, sending, replies and follow-ups.
   - Audit and reporting.

4. **Persistence**
   - Supabase PostgreSQL for structured records.
   - Supabase Storage for private company documents.
   - RLS for user-facing access.
   - Trusted server-side functions for privileged tasks, with explicit workspace checks.

5. **Background jobs**
   - Durable job records for document processing, research, campaign generation, reply sync and scheduled follow-ups.
   - Jobs carry workspace ID, initiating user ID, job type, status, retry count and idempotency key.
   - Prefer a queue/worker or managed scheduled execution over relying on a Telegram webhook request to perform long-running research.

### 3.2 Logical flow

`Telegram -> webhook -> identity/linking -> workspace authorization -> domain service -> workspace-scoped database/storage -> AI/search/mail provider`

Every domain service must receive an authorised workspace context derived on the server. It must not trust workspace IDs, owner IDs, mailbox IDs or approval status supplied by a client.

## 4. Proposed data model

The following is a target logical model, not a claim about the current database. Before migration, compare it against the live schema and existing data.

### Identity and tenancy

- `profiles`: application user profile and Telegram-link status.
- `workspaces`: company/customer tenant, display name, status and settings.
- `workspace_members`: workspace ID, user ID, role, invitation/activation state.
- `workspace_invitations`: hashed token, invited address or Telegram identity, role, expiry, accepted/revoked timestamps.
- `audit_logs`: workspace, actor, action, target type/ID, safe metadata and timestamp.

### Company intelligence

- `company_profiles`: legal/trading name, website, industry, country, locations, company description, contact details, target markets and profile status.
- `company_services`: products/services, descriptions, sectors, coverage, capacity and differentiators.
- `company_documents`: storage key, document type, filename, MIME type, checksum, uploader, processing status and access metadata.
- `document_extractions`: extracted structured fields, confidence, extraction version and review status.
- `evidence_items`: claim, source document/source URL, page or location, verification status, reviewer and timestamp.
- `past_projects`: project name, client (where authorised), scope, dates, location, outcome, optional value and evidence links.
- `references`: reference contact or published case study, permission status, evidence and usage restrictions.
- `certifications`: issuing body, certificate type/number, validity dates and evidence.

### Discovery and CRM

- `search_runs`: workspace, request, categories, geographies, criteria, status and timestamps.
- `organisations`: canonical prospect organisation and deduplication keys.
- `prospects`: workspace relationship, organisation, relevant contact, source, status and owner.
- `prospect_research`: findings, fit rationale, source URLs, publication/research dates and verification state.
- `opportunities`: type, buyer/issuer, scope, geography, eligibility, deadline, source, status and evidence.
- `fit_assessments`: criterion scores, weights, explanation, model/version and human review status.
- `suppression_records`: workspace-scoped do-not-contact and opt-out records.

### Outreach and communications

- `campaigns`: workspace, objective, audience, categories, message guidance, status and creator.
- `campaign_prospects`: campaign-to-prospect relationship and qualification state.
- `email_drafts`: workspace, prospect, campaign, mailbox, subject, body, evidence references, status, approval actor/time and send state.
- `mailboxes`: workspace, provider, mailbox address, connection owner, connection type, status and provider metadata.
- `mailbox_credentials`: encrypted OAuth tokens or secret references; never store plaintext tokens in ordinary profile rows.
- `email_threads`: mailbox, prospect, provider thread/message IDs and reply state.
- `email_activity`: sent, delivered (only when provider confirms), bounced, reply and error events.
- `followup_tasks`: due time, draft status, stop conditions and idempotency key.
- `background_jobs`: job state, attempts, errors, payload reference and idempotency key.

All tenant-owned records must include `workspace_id` directly or have an enforced parent relationship that proves workspace ownership. Add indexes and unique constraints for provider message IDs, invitation token hashes, deduplication keys and idempotency keys where appropriate.

## 5. Invitation-only access

- Only an authorised platform administrator can create an invitation.
- Invitation is scoped to a specific workspace and role.
- Token is cryptographically random, stored hashed, single-use and expires.
- Acceptance requires authenticated identity verification.
- Telegram linking uses a one-time code after authentication; bot username or chat ID is not proof of identity.
- Revoking membership immediately removes access to workspace data and connected actions.
- Workspace owner/admin can invite members subject to platform policy; members cannot elevate their own roles.

## 6. Mailbox model

Support two connection modes:

1. **User-connected:** a workspace member completes OAuth for their Gmail or Microsoft account. Store provider, mailbox address, granted scopes, token expiry and encrypted refresh token/secret reference.
2. **Administrator-managed:** a platform/workspace administrator connects a mailbox and explicitly assigns it to a workspace with an auditable grant.

Rules:
- Every campaign/draft resolves to one authorised mailbox.
- Sending service loads credentials for that mailbox only.
- Verify provider mailbox identity before sending.
- Encrypt refresh tokens using a managed secret/encryption key; never log tokens.
- Handle token refresh, revocation, reconnect and provider errors.
- Keep provider message/thread IDs for reconciliation and deduplication.
- Do not silently fall back to another mailbox.
- Respect provider quotas and applicable anti-spam rules.
- Replies must be synced per mailbox and matched using mailbox + thread/message context, not just a global email-address lookup.

## 7. Company document intelligence

1. Accept supported PDF/DOCX/TXT/CSV and image files within explicit size/type limits.
2. Store files in private workspace-scoped storage.
3. Validate MIME type, file signature and size; scan where supported.
4. Extract text and retain page/section references.
5. Classify documents (profile, registration, portfolio, contract, reference, certification, catalogue, pricing, other).
6. Extract candidate facts into structured records with source document, page/section and confidence.
7. Mark claims as user-supplied, document-extracted, externally corroborated or human-verified.
8. Ask an authorised user to confirm material facts before using them in external outreach.
9. Never infer or invent contracts, client names, values, certifications, regulatory status, testimonials or project outcomes.
10. Support correction, reprocessing and deletion with audit trail.

Uploaded documents and retrieved webpages are untrusted content. Ignore embedded instructions that attempt to override system policy, expose other workspace data, or trigger sending.

## 8. Prospect and opportunity discovery

Search categories:
- Potential customers and buyers.
- Strategic and channel partners.
- Supplier/distributor opportunities.
- Subcontracting.
- Public and private procurement.
- Tenders and requests for proposals.
- Grants and institutional programmes where relevant.

Each result should include:
- Organisation/opportunity name and official URL.
- Geography and sector.
- Opportunity category.
- Evidence that the organisation/opportunity exists.
- Evidence of an actual open opportunity, if claimed.
- Fit explanation tied to the workspace's verified capabilities.
- Source URL, research timestamp and relevant deadline.
- Contact route only when publicly and reliably available.
- Verification status and limitations.

Distinguish a **potential prospect** from a **confirmed active opportunity**. Do not label an organisation as seeking suppliers or partnerships without evidence. Do not invent decision-makers or email addresses.

Initial fit score can be an explainable prioritisation heuristic (capability match, evidence of need, geography, eligibility, contact route and timing). It is not a probability of winning a contract. Store score components and model/rubric version; allow human review.

Deduplicate organisations by canonical domain and normalised name. Re-check opportunity deadlines and status before a user acts.

## 9. Email drafting requirements

Every draft should use relevant available context:

- Sender's company name, website and authorised sender identity.
- Relevant services/products and capability.
- Prospect's organisation and researched context.
- Specific reason the recipient is a suitable match.
- Relevant, permissioned past projects, references or certifications.
- Proposed partnership, supply or contract discussion.
- One clear call to action.
- Accurate signature and contact details.

Rules:
- Retrieve only relevant evidence; attach citations/source links to internal draft metadata.
- If project history is absent, use verified team experience, demonstrations or capability evidence only when supplied and authorised.
- Never claim a recipient has an active need without evidence.
- Flag missing information rather than filling gaps with assumptions.
- Generate a preview and require explicit approval.
- Editing an approved draft should revoke approval and return it to pending.
- Approval records the approving user, timestamp and exact content hash.
- Any content/recipient/mailbox change invalidates the previous approval.
- Sending requires a fresh server-side check of workspace, draft status, approval record, mailbox authorisation, suppression list and idempotency state.

## 10. API and Telegram interface

Suggested Telegram actions:
- `/start`: link account or accept invitation.
- `/company`: view/edit company profile.
- `/documents`: upload and review documents.
- `/services`: manage products and services.
- `/projects`: manage past jobs and references.
- `/search`: discover prospects.
- `/opportunities`: search contracts/tenders/partnerships.
- `/prospects`: inspect prospect pipeline.
- `/campaigns`: create/manage campaigns.
- `/drafts`: review, edit and approve.
- `/mailboxes`: connect/select authorised mailbox.
- `/pipeline`: activity and outcomes.
- `/settings`: membership and preferences.

Suggested server routes (names are illustrative):
- `POST /api/telegram/webhook`
- `POST /api/invitations`, `POST /api/invitations/accept`
- `POST /api/telegram/link`
- `GET/POST /api/workspaces/:id/company`
- `POST /api/documents`, `POST /api/documents/:id/process`
- `POST /api/discovery/search`
- `GET /api/prospects`, `GET /api/opportunities`
- `POST /api/campaigns`, `POST /api/drafts/generate`
- `POST /api/drafts/:id/approve`, `POST /api/drafts/:id/send`
- `POST /api/mailboxes/oauth/start`, `GET /api/mailboxes/oauth/callback`
- `POST /api/mailboxes/:id/sync`

Every route must authenticate, resolve workspace membership server-side, validate input and apply role checks. Do not expose service-role credentials to browser or Telegram clients.

## 11. Implementation phases and acceptance criteria

### Phase 0 — Complete audit and safety baseline
- Inspect full repository tree, current schema/migrations, RLS policies, auth routes, all API handlers and deployment configuration.
- Confirm current production database and OAuth state without exposing secrets.
- Map existing records and identify backward-compatibility constraints.
- Add tests for unauthenticated access and cross-user/cross-workspace access.
- **Exit:** documented current schema and endpoint inventory; no destructive change.

### Phase 1 — Multi-tenant identity
- Add workspace, membership, invitation and role model.
- Add Telegram account linking and webhook verification.
- Enforce RLS and server-side ownership checks.
- Remove hardcoded sender identity.
- **Exit:** invited user can access only their workspace; unauthenticated and cross-tenant tests fail safely.

### Phase 2 — Company profile and documents
- Company profile, services, projects, references and certifications.
- Private document upload and extraction pipeline.
- Evidence provenance and user confirmation.
- **Exit:** uploaded profile becomes a reviewable, source-linked company record.

### Phase 3 — Discovery engine
- Search provider abstraction and source adapters.
- Prospect and opportunity categories.
- Research evidence, fit scoring and deduplication.
- **Exit:** results include sources, relevance rationale and explicit active-opportunity verification status.

### Phase 4 — Workspace-aware outreach
- Context retrieval from verified company evidence and prospect research.
- Draft generation with source metadata.
- Per-workspace campaign and mailbox selection.
- Approval invalidation on edits.
- **Exit:** drafts include relevant company identity, website, truthful experience and prospect-specific rationale.

### Phase 5 — Mailbox and lifecycle
- Per-mailbox Gmail and Outlook OAuth.
- Encrypted credential storage and refresh/reconnect.
- Idempotent sending, reconciliation, mailbox-scoped reply sync.
- Human-review follow-ups and suppression handling.
- **Exit:** approved message sends only from the selected authorised mailbox; replies map to the correct workspace and thread.

### Phase 6 — Operations and commercial readiness
- Usage limits, observability, error handling and cost accounting.
- Workspace administration and reporting.
- Backups, deletion/export procedures and incident response.
- Security review and pilot onboarding.
- **Exit:** controlled pilot with documented operational and support procedures.

## 12. Test strategy

- Unit tests for workspace resolution, role permissions, scoring and evidence selection.
- Integration tests for RLS and privileged server operations.
- Security tests for IDOR, cross-tenant leakage, webhook spoofing, replayed invitations and prompt injection.
- Mail tests with provider mocks; no real send in CI.
- Idempotency tests for duplicate jobs and repeated send requests.
- Document tests for malformed files, oversized files and extraction failures.
- Search tests for stale sources, duplicate organisations, missing evidence and expired tenders.
- End-to-end pilot: invite -> workspace -> upload profile -> confirm facts -> search -> review prospect -> draft -> approve -> send from selected mailbox -> sync reply.

## 13. Migration and compatibility principles

- Do not assume current tables or columns match the proposed model.
- Inspect live schema and RLS before creating migrations.
- Preserve existing single-user data and campaign history.
- Introduce workspace IDs through a staged, reversible migration.
- Backfill existing records into an explicitly designated legacy workspace only after owner confirmation.
- Keep old sending disabled during mailbox migration until a mailbox has been mapped and verified.
- Deploy additive schema first, application changes second, and enforce stricter constraints after backfill validation.
- Never print or commit secrets, refresh tokens, service-role keys or customer documents.

## 14. Immediate next implementation task

Complete Phase 0 by obtaining and reviewing the complete current Supabase schema, RLS policies and repository route inventory. The initial repository inspection found security-sensitive service-role routes and global mailbox configuration, so the first code changes should be authentication/workspace enforcement and mailbox isolation—not Telegram commands or bulk prospect discovery.
