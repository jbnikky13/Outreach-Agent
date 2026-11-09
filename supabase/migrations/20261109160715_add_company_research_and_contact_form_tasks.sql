create table public.company_research (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_name text not null,
  website text,
  industry text,
  headquarters text,
  description text,
  contact_email text,
  contact_page_url text,
  contact_channels jsonb not null default '{}'::jsonb,
  source_urls jsonb not null default '[]'::jsonb,
  research_status text not null default 'needs_review'
    check (research_status in ('needs_review','verified','rejected','archived')),
  research_query text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index company_research_workspace_created_idx
  on public.company_research(workspace_id, created_at desc);
create index company_research_status_idx
  on public.company_research(workspace_id, research_status);

create table public.contact_form_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_research_id uuid not null references public.company_research(id) on delete cascade,
  form_url text not null,
  purpose text not null,
  proposed_values jsonb not null default '{}'::jsonb,
  field_hints jsonb not null default '[]'::jsonb,
  status text not null default 'needs_review'
    check (status in ('needs_review','approved_for_manual_entry','submitted_by_user','blocked','cancelled')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  submission_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_form_tasks_https_url check (form_url ~ '^https://')
);
create index contact_form_tasks_workspace_created_idx
  on public.contact_form_tasks(workspace_id, created_at desc);
create index contact_form_tasks_research_idx
  on public.contact_form_tasks(company_research_id);

alter table public.company_research enable row level security;
alter table public.contact_form_tasks enable row level security;

create policy "workspace members read company research" on public.company_research
for select to authenticated using (
  private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer'])
);
create policy "workspace contributors insert company research" on public.company_research
for insert to authenticated with check (
  private.has_workspace_role(workspace_id, array['owner','admin','member'])
);
create policy "workspace contributors update company research" on public.company_research
for update to authenticated using (
  private.has_workspace_role(workspace_id, array['owner','admin','member'])
) with check (
  private.has_workspace_role(workspace_id, array['owner','admin','member'])
);
create policy "workspace admins delete company research" on public.company_research
for delete to authenticated using (
  private.has_workspace_role(workspace_id, array['owner','admin'])
);

create policy "workspace members read contact form tasks" on public.contact_form_tasks
for select to authenticated using (
  private.has_workspace_role(workspace_id, array['owner','admin','member','reviewer'])
);
create policy "workspace contributors insert contact form tasks" on public.contact_form_tasks
for insert to authenticated with check (
  private.has_workspace_role(workspace_id, array['owner','admin','member'])
);
create policy "workspace contributors update contact form tasks" on public.contact_form_tasks
for update to authenticated using (
  private.has_workspace_role(workspace_id, array['owner','admin','member'])
) with check (
  private.has_workspace_role(workspace_id, array['owner','admin','member'])
);
create policy "workspace admins delete contact form tasks" on public.contact_form_tasks
for delete to authenticated using (
  private.has_workspace_role(workspace_id, array['owner','admin'])
);

grant select, insert, update, delete on public.company_research, public.contact_form_tasks to authenticated;
grant all on public.company_research, public.contact_form_tasks to service_role;
revoke all on public.company_research, public.contact_form_tasks from anon;
