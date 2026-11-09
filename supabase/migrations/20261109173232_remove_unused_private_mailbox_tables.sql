-- Remove the unused private-schema draft from the initial iteration.
-- The application uses the service-role Supabase REST client, so the final
-- server-only tables are in public with explicit browser-deny RLS and grants.
drop table if exists private.mailbox_credentials cascade;
drop table if exists private.mailbox_oauth_states cascade;
drop table if exists private.user_mailbox_preferences cascade;
