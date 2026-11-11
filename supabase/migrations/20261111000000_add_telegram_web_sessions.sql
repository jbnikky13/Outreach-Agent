-- Server-only sessions for Telegram Mini App authentication.
-- Telegram initData is verified by the application server; this table never
-- grants browser roles direct access and does not create Supabase Auth JWTs.

create table if not exists public.telegram_web_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique check (session_hash ~ '^[a-f0-9]{64}$'),
  init_data_hash text not null unique check (init_data_hash ~ '^[a-f0-9]{64}$'),
  telegram_user_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint telegram_web_sessions_expiry_check check (expires_at > created_at)
);

create index if not exists telegram_web_sessions_user_workspace_idx
  on public.telegram_web_sessions(user_id, workspace_id, expires_at desc);

create index if not exists telegram_web_sessions_expiry_idx
  on public.telegram_web_sessions(expires_at)
  where revoked_at is null;

alter table public.telegram_web_sessions enable row level security;
revoke all on public.telegram_web_sessions from anon, authenticated;
grant all on public.telegram_web_sessions to service_role;

create policy "deny browser access to Telegram web sessions"
  on public.telegram_web_sessions
  for all to anon, authenticated
  using (false)
  with check (false);
