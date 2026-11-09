-- Reduce overlapping SELECT policy evaluation and cover missing foreign-key indexes.
-- Invitation and Telegram token tables intentionally remain service-role only.
drop policy if exists "workspace contributors manage campaigns" on public.campaigns;
create policy "workspace contributors insert campaigns" on public.campaigns for insert to authenticated
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors update campaigns" on public.campaigns for update to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors delete campaigns" on public.campaigns for delete to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']));

drop policy if exists "workspace contributors manage prospects" on public.prospects;
create policy "workspace contributors insert prospects" on public.prospects for insert to authenticated
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors update prospects" on public.prospects for update to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors delete prospects" on public.prospects for delete to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']));

drop policy if exists "workspace contributors manage drafts" on public.email_drafts;
create policy "workspace contributors insert drafts" on public.email_drafts for insert to authenticated
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors update drafts" on public.email_drafts for update to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors delete drafts" on public.email_drafts for delete to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']));

drop policy if exists "workspace contributors manage threads" on public.email_threads;
create policy "workspace contributors insert threads" on public.email_threads for insert to authenticated
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors update threads" on public.email_threads for update to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors delete threads" on public.email_threads for delete to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']));

drop policy if exists "workspace contributors manage activities" on public.activities;
create policy "workspace contributors insert activities" on public.activities for insert to authenticated
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors update activities" on public.activities for update to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors delete activities" on public.activities for delete to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']));

drop policy if exists "workspace admins manage mailboxes" on public.mailboxes;
create policy "workspace admins insert mailboxes" on public.mailboxes for insert to authenticated
with check (private.has_workspace_role(workspace_id, array['owner','admin']));
create policy "workspace admins update mailboxes" on public.mailboxes for update to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin']))
with check (private.has_workspace_role(workspace_id, array['owner','admin']));
create policy "workspace admins delete mailboxes" on public.mailboxes for delete to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "workspace contributors manage company profile" on public.company_profiles;
create policy "workspace contributors insert company profile" on public.company_profiles for insert to authenticated
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors update company profile" on public.company_profiles for update to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (private.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "workspace contributors delete company profile" on public.company_profiles for delete to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','member']));

create index if not exists activities_campaign_id_idx on public.activities(campaign_id);
create index if not exists activities_prospect_id_idx on public.activities(prospect_id);
create index if not exists email_drafts_prospect_id_idx on public.email_drafts(prospect_id);
create index if not exists email_threads_prospect_id_idx on public.email_threads(prospect_id);
create index if not exists mailboxes_owner_id_idx on public.mailboxes(owner_id);
create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index if not exists telegram_link_codes_workspace_id_idx on public.telegram_link_codes(workspace_id);
create index if not exists telegram_link_codes_user_id_idx on public.telegram_link_codes(user_id);
create index if not exists workspace_invitations_created_by_idx on public.workspace_invitations(created_by);
create index if not exists workspaces_created_by_idx on public.workspaces(created_by);
