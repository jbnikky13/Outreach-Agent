create table public.campaigns (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 goal text,
 status text not null default 'draft' check (status in ('draft','active','paused','completed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 owner_id uuid references auth.users(id) on delete cascade,
 topic text, audience text, talking_points text, tone text, personalization_instructions text
);
create table public.prospects (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid references public.campaigns(id) on delete cascade,
 name text not null, company text, email text not null, website text, reason text,
 status text not null default 'new' check (status in ('new','draft','ready','sent','replied','not_interested','bounced')),
 last_contacted_at timestamptz, next_follow_up_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 owner_id uuid references auth.users(id) on delete cascade
);
create table public.email_drafts (
 id uuid primary key default gen_random_uuid(),
 prospect_id uuid not null references public.prospects(id) on delete cascade,
 subject text not null, body text not null,
 status text not null default 'pending' check (status in ('pending','approved','rejected','sent')),
 approved_at timestamptz, sent_at timestamptz,
 created_at timestamptz not null default now(),
 owner_id uuid references auth.users(id) on delete cascade,
 provider_message_id text, send_attempted_at timestamptz
);
create table public.email_threads (
 id uuid primary key default gen_random_uuid(),
 prospect_id uuid not null references public.prospects(id) on delete cascade,
 provider text not null, provider_thread_id text, last_message_at timestamptz,
 created_at timestamptz not null default now(),
 owner_id uuid references auth.users(id) on delete cascade,
 provider_message_id text, last_inbound_at timestamptz,
 awaiting_reply boolean not null default false
);
create table public.activities (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid references public.campaigns(id) on delete cascade,
 prospect_id uuid references public.prospects(id) on delete cascade,
 type text not null, detail text,
 created_at timestamptz not null default now(),
 owner_id uuid references auth.users(id) on delete cascade
);
create table public.mailboxes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid references auth.users(id) on delete cascade,
 provider text not null check (provider in ('agentmail','outlook','resend')),
 provider_inbox_id text not null, email text not null, display_name text,
 active boolean not null default true, created_at timestamptz not null default now(),
 constraint mailboxes_provider_provider_inbox_id_key unique(provider,provider_inbox_id)
);
create index activities_created_at_idx on public.activities(created_at desc);
create index activities_owner_id_idx on public.activities(owner_id);
create index campaigns_owner_id_idx on public.campaigns(owner_id);
create index drafts_owner_id_idx on public.email_drafts(owner_id);
create index drafts_status_idx on public.email_drafts(status);
create unique index email_drafts_provider_message_id_idx on public.email_drafts(provider_message_id) where provider_message_id is not null;
create index email_threads_provider_message_id_idx on public.email_threads(provider_message_id);
create index threads_owner_id_idx on public.email_threads(owner_id);
create index prospects_campaign_id_idx on public.prospects(campaign_id);
create index prospects_next_follow_up_idx on public.prospects(next_follow_up_at);
create index prospects_owner_id_idx on public.prospects(owner_id);
create index prospects_status_idx on public.prospects(status);
alter table public.campaigns enable row level security;
alter table public.prospects enable row level security;
alter table public.email_drafts enable row level security;
alter table public.email_threads enable row level security;
alter table public.activities enable row level security;
alter table public.mailboxes enable row level security;
create policy "owners manage campaigns" on public.campaigns for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners manage prospects" on public.prospects for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners manage drafts" on public.email_drafts for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners manage threads" on public.email_threads for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners manage activities" on public.activities for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners manage mailboxes" on public.mailboxes for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant all on public.campaigns, public.prospects, public.email_drafts, public.email_threads, public.activities, public.mailboxes to authenticated, service_role;
revoke all on public.campaigns, public.prospects, public.email_drafts, public.email_threads, public.activities, public.mailboxes from anon;
