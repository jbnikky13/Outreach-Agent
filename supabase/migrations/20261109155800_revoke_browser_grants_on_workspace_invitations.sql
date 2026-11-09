-- Explicitly remove default browser grants from server-only invitation records.
revoke all on table public.workspace_invitations from anon, authenticated;
grant all on table public.workspace_invitations to service_role;
