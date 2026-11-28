create or replace function private.guard_private_booking_date()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_check_date boolean := false;
begin
  if tg_op = 'INSERT' then
    v_check_date := true;
  else
    v_check_date := new.status = 'accepted'
      and old.status is distinct from new.status;
  end if;

  if v_check_date and not public.is_private_lesson_date_allowed(new.session_date) then
    raise exception 'Les cours particuliers ne sont pas autorisés pendant les vacances scolaires, les dimanches ou les jours fériés (sauf le 8 mai).';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_private_booking_date on public.booking_requests;
create trigger guard_private_booking_date
before insert or update of status
on public.booking_requests
for each row
execute function private.guard_private_booking_date();