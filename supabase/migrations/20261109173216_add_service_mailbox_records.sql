-- Server-only mailbox records are kept in public so the existing Supabase
-- service-role PostgREST client can access them without exposing the private
-- schema through Data API configuration. Explicit grants + deny-all browser
-- RLS policies provide the boundary.

create table if not exists public.mailbox_credentials (
  mailbox_id uuid primary key references public.mailboxes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_token_ciphertext text,
  refresh_token_ciphertext text not null,
  encryption_version smallint not null default 1,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists mailbox_credentials_user_workspace_idx
  on public.mailbox_credentials(user_id, workspace_id);

create table if not exists public.mailbox_oauth_states (
  state_hash text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mailbox_oauth_states_expiry_idx
  on public.mailbox_oauth_states(expires_at);

create table if not exists public.user_mailbox_preferences (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (workspace_id, user_id, mailbox_id)
);

alter table public.mailbox_credentials enable row level security;
alter table public.mailbox_oauth_states enable row level security;
alter table public.user_mailbox_preferences enable row level security;

create policy "deny browser access to mailbox credentials" on public.mailbox_credentials
for all to anon, authenticated using (false) with check (false);
create policy "deny browser access to mailbox oauth states" on public.mailbox_oauth_states
for all to anon, authenticated using (false) with check (false);
create policy "deny browser access to mailbox preferences" on public.user_mailbox_preferences
for all to anon, authenticated using (false) with check (false);

revoke all on public.mailbox_credentials, public.mailbox_oauth_states, public.user_mailbox_preferences
from public, anon, authenticated;
grant all on public.mailbox_credentials, public.mailbox_oauth_states, public.user_mailbox_preferences
to service_role;
