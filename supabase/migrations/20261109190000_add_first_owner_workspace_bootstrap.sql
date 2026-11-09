-- One-time first-owner bootstrap for the invitation-only deployment.
-- The advisory lock serializes competing requests. Only service_role can call
-- this SECURITY DEFINER function; the function refuses to run after the first
-- workspace exists.

create or replace function private.bootstrap_first_workspace(
  p_user_id uuid,
  p_workspace_name text default 'Outreach Agent Workspace'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_workspace_id uuid;
  normalized_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended('outreach-agent:first-owner-bootstrap', 0));

  if exists (select 1 from public.workspaces limit 1) then
    raise exception 'First-owner bootstrap has already been completed';
  end if;

  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Bootstrap owner must be an existing Supabase Auth user';
  end if;

  normalized_name := nullif(btrim(p_workspace_name), '');
  if normalized_name is null then
    normalized_name := 'Outreach Agent Workspace';
  end if;

  insert into public.workspaces (name, created_by)
  values (left(normalized_name, 120), p_user_id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, p_user_id, 'owner');

  insert into public.audit_logs (
    workspace_id, actor_id, event_type, entity_type, entity_id, metadata
  ) values (
    new_workspace_id, p_user_id, 'workspace.first_owner_bootstrapped',
    'workspace', new_workspace_id::text, jsonb_build_object('source', 'one_time_bootstrap')
  );

  return new_workspace_id;
end;
$function$;

revoke all on function private.bootstrap_first_workspace(uuid, text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.bootstrap_first_workspace(uuid, text) to service_role;
