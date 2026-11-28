create or replace function private.guard_booking_start_time_half_hour()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_check_time boolean := false;
begin
  if tg_op = 'INSERT' then
    v_check_time := true;
  else
    v_check_time := new.start_time is distinct from old.start_time
      or (new.status = 'accepted' and old.status is distinct from new.status);
  end if;

  if v_check_time and (
    extract(minute from new.start_time)::integer not in (0, 30)
    or extract(second from new.start_time) <> 0
  ) then
    raise exception 'Les réservations sont possibles uniquement à l’heure pile ou à la demi-heure.';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_booking_start_time_half_hour on public.booking_requests;
create trigger guard_booking_start_time_half_hour
before insert or update of start_time, status
on public.booking_requests
for each row
execute function private.guard_booking_start_time_half_hour();