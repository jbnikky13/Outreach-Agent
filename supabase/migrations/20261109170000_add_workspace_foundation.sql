-- Outreach-Agent 2.0: additive multi-workspace foundation.
-- Forward-only migration. Do not run against production until reviewed and tested
-- on a staging clone. Existing owner_id columns and rows are intentionally kept.

create schema if not exists private;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Workspace',
  created_by uuid not null references auth.users(id) on delete restrict,
  legacy_owner_id uuid unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'reviewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_email text not null,
  role text not null check (role in ('admin', 'member', 'reviewer')),
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  company_name text,
  website text,
  industry text,
  description text,
  headquarters text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.campaigns add column if not exists workspace_id uuid;
alter table public.prospects add column if not exists workspace_id uuid;
alter table public.email_drafts add column if not exists workspace_id uuid;
alter table public.email_threads add column if not exists workspace_id uuid;
alter table public.activities add column if not exists workspace_id uuid;
alter table public.mailboxes add column if not exists workspace_id uuid;

-- Create one legacy workspace for each existing owner, including owners
-- recovered through the parent prospect/campaign for older nullable rows.
insert into public.workspaces (name, created_by, legacy_owner_id)
select 'My Workspace', owners.user_id, owners.user_id
from (
  select owner_id as user_id from public.campaigns where owner_id is not null
  union
  select owner_id from public.prospects where owner_id is not null
  union
  select owner_id from public.email_drafts where owner_id is not null
  union
  select coalesce(t.owner_id, p.owner_id)
    from public.email_threads t
    left join public.prospects p on p.id = t.prospect_id
   where coalesce(t.owner_id, p.owner_id) is not null
  union
  select coalesce(a.owner_id, c.owner_id, p.owner_id)
    from public.activities a
    left join public.campaigns c on c.id = a.campaign_id
    left join public.prospects p on p.id = a.prospect_id
   where coalesce(a.owner_id, c.owner_id, p.owner_id) is not null
  union
  select owner_id from public.mailboxes where owner_id is not null
) owners
on conflict (legacy_owner_id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.legacy_owner_id, 'owner'
from public.workspaces w
where w.legacy_owner_id is not null
on conflict (workspace_id, user_id) do nothing;

-- Repair only missing legacy owner_id values where a parent provides an
-- unambiguous owner. No existing non-null owner_id is overwritten.
update public.email_threads t
   set owner_id = p.owner_id
  from public.prospects p
 where t.prospect_id = p.id
   and t.owner_id is null
   and p.owner_id is not null;

update public.activities a
   set owner_id = coalesce(c.owner_id, p.owner_id)
  from public.campaigns c
  full join public.prospects p on p.id = a.prospect_id
 where (a.campaign_id = c.id or a.campaign_id is null)
   and a.owner_id is null
   and coalesce(c.owner_id, p.owner_id) is not null;

update public.campaigns t
   set workspace_id = w.id
  from public.workspaces w
 where t.owner_id = w.legacy_owner_id
   and t.workspace_id is null;

update public.prospects t
   set workspace_id = w.id
  from public.workspaces w
 where t.owner_id = w.legacy_owner_id
   and t.workspace_id is null;

update public.email_drafts t
   set workspace_id = w.id
  from public.workspaces w
 where t.owner_id = w.legacy_owner_id
   and t.workspace_id is null;

update public.email_threads t
   set workspace_id = w.id
  from public.workspaces w
 where t.owner_id = w.legacy_owner_id
   and t.workspace_id is null;

update public.activities t
   set workspace_id = w.id
  from public.workspaces w
 where t.owner_id = w.legacy_owner_id
   and t.workspace_id is null;

update public.mailboxes t
   set workspace_id = w.id
  from public.workspaces w
 where t.owner_id = w.legacy_owner_id
   and t.workspace_id is null;

do $$
begin
  if exists (select 1 from public.campaigns where workspace_id is null)
     or exists (select 1 from public.prospects where workspace_id is null)
     or exists (select 1 from public.email_drafts where workspace_id is null)
     or exists (select 1 from public.email_threads where workspace_id is null)
     or exists (select 1 from public.activities where workspace_id is null)
     or exists (select 1 from public.mailboxes where workspace_id is null) then
    raise exception 'Workspace backfill incomplete; migration aborted without changing existing access policies.';
  end if;
end
$$;

alter table public.campaigns alter column workspace_id set not null;
alter table public.prospects alter column workspace_id set not null;
alter table public.email_drafts alter column workspace_id set not null;
alter table public.email_threads alter column workspace_id set not null;
alter table public.activities alter column workspace_id set not null;
alter table public.mailboxes alter column workspace_id set not null;

alter table public.campaigns
  add constraint campaigns_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id);
alter table public.prospects
  add constraint prospects_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id);
alter table public.email_drafts
  add constraint email_drafts_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id);
alter table public.email_threads
  add constraint email_threads_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id);
alter table public.activities
  add constraint activities_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id);
alter table public.mailboxes
  add constraint mailboxes_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id);

create index if not exists campaigns_workspace_id_idx on public.campaigns(workspace_id);
create index if not exists prospects_workspace_id_idx on public.prospects(workspace_id);
create index if not exists email_drafts_workspace_id_idx on public.email_drafts(workspace_id);
create index if not exists email_threads_workspace_id_idx on public.email_threads(workspace_id);
create index if not exists activities_workspace_id_idx on public.activities(workspace_id);
create index if not exists mailboxes_workspace_id_idx on public.mailboxes(workspace_id);
create index if not exists workspace_members_user_workspace_idx on public.workspace_members(user_id, workspace_id);
create index if not exists workspace_invitations_workspace_expiry_idx on public.workspace_invitations(workspace_id, expires_at);
create index if not exists audit_logs_workspace_created_idx on public.audit_logs(workspace_id, created_at desc);

-- These invoker functions read only the caller's own membership row. They
-- do not bypass RLS and are kept outside the exposed public schema.
create or replace function private.has_workspace_role(p_workspace_id uuid, p_roles text[])
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role = any (p_roles)
  );
$function$;

revoke all on function private.has_workspace_role(uuid, text[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.company_profiles enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "owners manage campaigns" on public.campaigns;
drop policy if exists "owners manage prospects" on public.prospects;
drop policy if exists "owners manage drafts" on public.email_drafts;
drop policy if exists "owners manage threads" on public.email_threads;
drop policy if exists "owners manage activities" on public.activities;
drop policy if exists "owners manage mailboxes" on public.mailboxes;

create policy "workspace members read campaigns" on public.campaigns
for select to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer']));
create policy "workspace contributors manage campaigns" on public.campaigns
for all to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "workspace members read prospects" on public.prospects
for select to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer']));
create policy "workspace contributors manage prospects" on public.prospects
for all to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "workspace members read drafts" on public.email_drafts
for select to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer']));
create policy "workspace contributors manage drafts" on public.email_drafts
for all to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "workspace members read threads" on public.email_threads
for select to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer']));
create policy "workspace contributors manage threads" on public.email_threads
for all to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "workspace members read activities" on public.activities
for select to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer']));
create policy "workspace contributors manage activities" on public.activities
for all to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "workspace members read mailboxes" on public.mailboxes
for select to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer']));
create policy "workspace admins manage mailboxes" on public.mailboxes
for all to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin']))
with check (private.has_workspace_role(workspace_id, array['owner','admin']));

create policy "workspace members read workspace" on public.workspaces
for select to authenticated
using (private.has_workspace_role(id, array['owner','admin','member','reviewer']));
create policy "workspace admins update workspace" on public.workspaces
for update to authenticated
using (private.has_workspace_role(id, array['owner','admin']))
with check (private.has_workspace_role(id, array['owner','admin']));

create policy "members read own membership" on public.workspace_members
for select to authenticated
using (user_id = (select auth.uid()));

create policy "workspace members read company profile" on public.company_profiles
for select to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer']));
create policy "workspace contributors manage company profile" on public.company_profiles
for all to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "workspace members read audit logs" on public.audit_logs
for select to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer']));

-- Invitations and audit-log writes remain server-only in this phase. The
-- service-role key must never be exposed to browser or Telegram clients.
