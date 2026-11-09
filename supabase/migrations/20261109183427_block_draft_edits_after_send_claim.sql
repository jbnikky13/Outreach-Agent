-- Prevent a concurrent browser edit from changing a draft after the
-- one-shot send claim has been acquired. The sender must either complete or
-- leave the attempt in reconciliation; content edits cannot race the provider call.
create or replace function private.invalidate_draft_approval_on_edit()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.send_attempted_at is not null then
    raise exception 'Draft content cannot be edited after a send attempt has started';
  end if;

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
