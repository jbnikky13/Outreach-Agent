-- Run only against the isolated Outreach Agent Staging project after all
-- currently recorded staging migrations have been applied. These checks are read-only.
-- to a staging database. These checks are read-only.

do $$
begin
  if exists (select 1 from public.campaigns where workspace_id is null)
     or exists (select 1 from public.prospects where workspace_id is null)
     or exists (select 1 from public.email_drafts where workspace_id is null)
     or exists (select 1 from public.email_threads where workspace_id is null)
     or exists (select 1 from public.activities where workspace_id is null)
     or exists (select 1 from public.mailboxes where workspace_id is null) then
    raise exception 'FAIL: one or more outreach records have no workspace_id';
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.role = 'owner'
      and w.legacy_owner_id is not null
      and wm.user_id <> w.legacy_owner_id
  ) then
    raise exception 'FAIL: legacy workspace owner membership mismatch';
  end if;

  if exists (
    select 1
    from public.campaigns c
    join public.prospects p on p.campaign_id = c.id
    where c.workspace_id <> p.workspace_id
  ) then
    raise exception 'FAIL: a prospect is in a different workspace from its campaign';
  end if;

  if exists (
    select 1
    from public.email_drafts d
    join public.prospects p on p.id = d.prospect_id
    where d.workspace_id <> p.workspace_id
  ) then
    raise exception 'FAIL: a draft is in a different workspace from its prospect';
  end if;

  if exists (
    select 1
    from public.email_threads t
    join public.prospects p on p.id = t.prospect_id
    where t.workspace_id <> p.workspace_id
  ) then
    raise exception 'FAIL: a thread is in a different workspace from its prospect';
  end if;

  if exists (
    select 1
    from public.activities a
    where (a.campaign_id is not null and not exists (
      select 1 from public.campaigns c
      where c.id = a.campaign_id and c.workspace_id = a.workspace_id
    ))
    or (a.prospect_id is not null and not exists (
      select 1 from public.prospects p
      where p.id = a.prospect_id and p.workspace_id = a.workspace_id
    ))
  ) then
    raise exception 'FAIL: an activity is outside its linked record workspace';
  end if;
end
$$;

select 'campaigns' as table_name, count(*) as rows, count(distinct workspace_id) as workspaces from public.campaigns
union all select 'prospects', count(*), count(distinct workspace_id) from public.prospects
union all select 'email_drafts', count(*), count(distinct workspace_id) from public.email_drafts
union all select 'email_threads', count(*), count(distinct workspace_id) from public.email_threads
union all select 'activities', count(*), count(distinct workspace_id) from public.activities
union all select 'mailboxes', count(*), count(distinct workspace_id) from public.mailboxes;

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'workspaces', 'workspace_members', 'workspace_invitations',
    'company_profiles', 'audit_logs', 'campaigns', 'prospects',
    'email_drafts', 'email_threads', 'activities', 'mailboxes'
  )
order by tablename, policyname;
