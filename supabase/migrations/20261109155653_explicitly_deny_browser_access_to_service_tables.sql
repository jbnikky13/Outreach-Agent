-- Make service-only tables explicitly deny all browser roles under RLS.
-- Trusted server handlers use service_role; no anon/authenticated policies are intended.
create policy "deny browser access to workspace invitations" on public.workspace_invitations
for all to anon, authenticated using (false) with check (false);
create policy "deny browser access to Telegram link codes" on public.telegram_link_codes
for all to anon, authenticated using (false) with check (false);
create policy "deny browser access to Telegram accounts" on public.telegram_accounts
for all to anon, authenticated using (false) with check (false);
