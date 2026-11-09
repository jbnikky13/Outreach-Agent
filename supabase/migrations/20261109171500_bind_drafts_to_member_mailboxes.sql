-- Bind every newly generated draft to the member's selected mailbox.
alter table public.email_drafts
  add column if not exists mailbox_id uuid references public.mailboxes(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists email_drafts_workspace_mailbox_idx
  on public.email_drafts(workspace_id, mailbox_id, created_by);
