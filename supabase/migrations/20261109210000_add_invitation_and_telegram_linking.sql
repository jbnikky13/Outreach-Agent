-- Invitation acceptance and Telegram identity-linking primitives.
-- All token redemption runs through trusted server handlers using service_role.

create table if not exists public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_user_id bigint not null unique,
  telegram_chat_id bigint not null,
  linked_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists telegram_link_codes_expiry_idx
  on public.telegram_link_codes(expires_at) where consumed_at is null;
create index if not exists telegram_accounts_workspace_idx
  on public.telegram_accounts(workspace_id);

alter table public.telegram_link_codes enable row level security;
alter table public.telegram_accounts enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;
revoke all on public.telegram_accounts from anon, authenticated;

create or replace function private.accept_workspace_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_user_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  invitation public.workspace_invitations%rowtype;
begin
  select * into invitation
    from public.workspace_invitations
   where token_hash = p_token_hash
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
     and lower(invited_email) = lower(p_user_email)
   for update;

  if not found then
    raise exception 'Invitation is invalid, expired, revoked, or belongs to another email';
  end if;

  if exists (
    select 1 from public.workspace_members
     where workspace_id = invitation.workspace_id and user_id = p_user_id
  ) then
    raise exception 'User is already a member of this workspace';
  end if;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (invitation.workspace_id, p_user_id, invitation.role);

  update public.workspace_invitations
     set accepted_at = now()
   where id = invitation.id;

  insert into public.audit_logs(workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
  values (invitation.workspace_id, p_user_id, 'workspace.invitation.accepted',
          'workspace_invitation', invitation.id::text,
          jsonb_build_object('role', invitation.role, 'email', lower(p_user_email)));

  return invitation.workspace_id;
end;
$function$;

create or replace function private.redeem_telegram_link_code(
  p_code_hash text,
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  link_code public.telegram_link_codes%rowtype;
begin
  select * into link_code
    from public.telegram_link_codes
   where code_hash = p_code_hash
     and consumed_at is null
     and expires_at > now()
   for update;

  if not found then
    raise exception 'Telegram link code is invalid, expired, or already used';
  end if;

  if exists (select 1 from public.telegram_accounts where telegram_user_id = p_telegram_user_id)
     or exists (select 1 from public.telegram_accounts where user_id = link_code.user_id) then
    raise exception 'Telegram account or workspace user is already linked';
  end if;

  insert into public.telegram_accounts(workspace_id, user_id, telegram_user_id, telegram_chat_id)
  values (link_code.workspace_id, link_code.user_id, p_telegram_user_id, p_telegram_chat_id);

  update public.telegram_link_codes set consumed_at = now() where id = link_code.id;

  insert into public.audit_logs(workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
  values (link_code.workspace_id, link_code.user_id, 'telegram.account.linked',
          'telegram_account', p_telegram_user_id::text, '{}'::jsonb);

  return link_code.workspace_id;
end;
$function$;

revoke all on function private.accept_workspace_invitation(text, uuid, text) from public, anon, authenticated;
revoke all on function private.redeem_telegram_link_code(text, bigint, bigint) from public, anon, authenticated;
grant execute on function private.accept_workspace_invitation(text, uuid, text) to service_role;
grant execute on function private.redeem_telegram_link_code(text, bigint, bigint) to service_role;
