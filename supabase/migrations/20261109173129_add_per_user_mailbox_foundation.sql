-- Per-member mailbox foundation. OAuth tokens are encrypted by the application
-- before persistence; this migration deliberately stores ciphertext only.
-- All credential and OAuth-state tables live in the unexposed private schema.

create schema if not exists private;

alter table public.mailboxes
  add column if not exists connected_by uuid references auth.users(id) on delete set null,
  add column if not exists connection_type text not null default 'user'
    check (connection_type in ('user', 'admin_managed')),
  add column if not exists provider_account_id text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists revoked_at timestamptz;

-- Existing provider values remain valid. New OAuth connections use gmail/outlook.
alter table public.mailboxes
  drop constraint if exists mailboxes_provider_check;
alter table public.mailboxes
  add constraint mailboxes_provider_check
  check (provider in ('agentmail', 'outlook', 'resend', 'gmail'));

create index if not exists mailboxes_connected_by_workspace_idx
  on public.mailboxes(connected_by, workspace_id)
  where revoked_at is null;

create table if not exists private.mailbox_credentials (
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
  on private.mailbox_credentials(user_id, workspace_id);

create table if not exists private.mailbox_oauth_states (
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
  on private.mailbox_oauth_states(expires_at);

create table if not exists private.user_mailbox_preferences (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (workspace_id, user_id, mailbox_id)
);

alter table private.mailbox_credentials enable row level security;
alter table private.mailbox_oauth_states enable row level security;
alter table private.user_mailbox_preferences enable row level security;

-- These tables are accessed only by authenticated server handlers using service_role.
-- Preserve authenticated schema usage for existing workspace RLS helper functions.
-- The credential tables themselves remain inaccessible to browser roles.
revoke all on table
  private.mailbox_credentials,
  private.mailbox_oauth_states,
  private.user_mailbox_preferences
from public, anon, authenticated;
grant all on table
  private.mailbox_credentials,
  private.mailbox_oauth_states,
  private.user_mailbox_preferences
to service_role;

-- Mailbox identity metadata is not a credential. Members can read their own
-- connections; workspace owners/admins can inspect managed/shared mailbox metadata.
drop policy if exists "workspace members read mailboxes" on public.mailboxes;
drop policy if exists "workspace admins manage mailboxes" on public.mailboxes;
drop policy if exists "workspace members read own or managed mailboxes" on public.mailboxes;
create policy "workspace members read own or managed mailboxes" on public.mailboxes
for select to authenticated
using (
  private.has_workspace_role(workspace_id, array['owner','admin'])
  or connected_by = (select auth.uid())
  or (connected_by is null and connection_type = 'admin_managed'
      and private.has_workspace_role(workspace_id, array['member','reviewer']))
);

-- Mailbox metadata writes remain server-only. This prevents clients from
-- assigning another member's mailbox or changing connection ownership.
revoke insert, update, delete on public.mailboxes from anon, authenticated;
grant select on public.mailboxes to authenticated;
grant all on public.mailboxes to service_role;
