-- Coach In — rappels internes automatiques 24 h avant un cours particulier accepté.
-- Les horaires des réservations sont interprétés dans le fuseau Europe/Paris.
begin;

alter table public.booking_requests
  add column if not exists reminder_sent_at timestamptz;

create or replace function public.reset_booking_reminder()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.coach_id is distinct from old.coach_id
     or new.player_id is distinct from old.player_id
     or new.session_date is distinct from old.session_date
     or new.start_time is distinct from old.start_time
     or new.duration_minutes is distinct from old.duration_minutes
     or new.status is distinct from old.status then
    new.reminder_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists booking_requests_reset_reminder on public.booking_requests;
create trigger booking_requests_reset_reminder
before update on public.booking_requests
for each row execute function public.reset_booking_reminder();

create or replace function public.process_booking_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_sent integer := 0;
  v_player_enabled boolean;
  v_coach_enabled boolean;
  v_start timestamptz;
  v_when text;
begin
  for v_booking in
    select b.id,b.player_id,b.coach_id,b.session_date,b.start_time
    from public.booking_requests b
    where b.status = 'accepted'
      and b.reminder_sent_at is null
      and ((b.session_date + b.start_time) at time zone 'Europe/Paris')
          between now() + interval '23 hours 45 minutes'
              and now() + interval '24 hours 15 minutes'
    order by b.session_date,b.start_time
    for update skip locked
  loop
    select coalesce(np.reminders_24h,true) into v_player_enabled
    from public.notification_preferences np
    where np.user_id=v_booking.player_id;
    if not found then v_player_enabled := true; end if;

    select coalesce(np.reminders_24h,true) into v_coach_enabled
    from public.notification_preferences np
    where np.user_id=v_booking.coach_id;
    if not found then v_coach_enabled := true; end if;

    v_when := pg_catalog.to_char(v_booking.session_date,'DD/MM/YYYY') || ' à ' ||
              pg_catalog.to_char(v_booking.start_time,'HH24:MI');

    if v_player_enabled then
      insert into public.player_notifications(player_id,notification_type,title,body,target_path)
      values(v_booking.player_id,'booking_reminder','Ton cours est demain',
        'Rappel : ton cours particulier est prévu demain, le ' || v_when || '.','bookings');
    end if;

    if v_coach_enabled then
      insert into public.coach_notifications(coach_id,player_id,notification_type,title,body,target_path)
      values(v_booking.coach_id,v_booking.player_id,'booking_reminder','Cours particulier demain',
        'Rappel : un cours particulier est prévu demain, le ' || v_when || '.','bookings');
    end if;

    update public.booking_requests set reminder_sent_at=now() where id=v_booking.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

revoke all on function public.process_booking_reminders() from public;
revoke all on function public.process_booking_reminders() from anon;
revoke all on function public.process_booking_reminders() from authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid)
from cron.job
where jobname = 'coach-in-booking-reminders';

select cron.schedule(
  'coach-in-booking-reminders',
  '*/15 * * * *',
  'select public.process_booking_reminders();'
);

commit;
