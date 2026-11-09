-- Prevent browser-side draft edits from preserving or manufacturing approval.
-- Editing subject/body always returns a draft to pending and clears approval evidence.
create or replace function private.invalidate_draft_approval_on_edit()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.subject is distinct from old.subject
     or new.body is distinct from old.body then
    new.status := 'pending';
    new.approved_at := null;
    new.approved_by := null;
    new.approved_content_hash := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists email_drafts_invalidate_approval on public.email_drafts;
create trigger email_drafts_invalidate_approval
before update of subject, body on public.email_drafts
for each row execute function private.invalidate_draft_approval_on_edit();

-- Authenticated clients may edit only content fields. Workflow and approval
-- metadata are writable only by trusted server-side service-role handlers.
revoke update on table public.email_drafts from authenticated;
grant update (subject, body) on table public.email_drafts to authenticated;
