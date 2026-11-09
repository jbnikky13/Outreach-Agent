create index if not exists company_research_created_by_idx on public.company_research(created_by);
create index if not exists contact_form_tasks_approved_by_idx on public.contact_form_tasks(approved_by);
create index if not exists contact_form_tasks_created_by_idx on public.contact_form_tasks(created_by);
create index if not exists contact_form_tasks_submitted_by_idx on public.contact_form_tasks(submitted_by);
