-- Add covering indexes for foreign keys identified by the staging performance advisor.
-- Keep these separate from the earlier mailbox foundation migrations so the
-- already-applied migration history remains immutable.
create index if not exists email_drafts_created_by_idx
  on public.email_drafts(created_by);
create index if not exists email_drafts_mailbox_id_idx
  on public.email_drafts(mailbox_id);
create index if not exists mailbox_credentials_workspace_id_idx
  on public.mailbox_credentials(workspace_id);
create index if not exists mailbox_oauth_states_user_id_idx
  on public.mailbox_oauth_states(user_id);
create index if not exists mailbox_oauth_states_workspace_id_idx
  on public.mailbox_oauth_states(workspace_id);
create index if not exists user_mailbox_preferences_mailbox_id_idx
  on public.user_mailbox_preferences(mailbox_id);
create index if not exists user_mailbox_preferences_user_id_idx
  on public.user_mailbox_preferences(user_id);
