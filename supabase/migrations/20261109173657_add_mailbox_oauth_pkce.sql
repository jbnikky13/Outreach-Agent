alter table public.mailbox_oauth_states
  add column if not exists code_verifier text not null default '';
alter table public.mailbox_oauth_states
  alter column code_verifier drop default;
