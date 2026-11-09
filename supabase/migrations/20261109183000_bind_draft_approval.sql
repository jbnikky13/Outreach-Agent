-- Bind approval to the exact stored draft content and authenticated approver.
-- Apply only after the workspace foundation has been reconciled and tested in staging.
alter table public.email_drafts
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_content_hash text;

create index if not exists email_drafts_approved_by_idx
  on public.email_drafts(approved_by)
  where approved_by is not null;
