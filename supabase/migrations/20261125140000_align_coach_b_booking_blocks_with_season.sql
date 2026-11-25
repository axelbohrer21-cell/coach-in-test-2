-- Keep Coach B's booking lock aligned with the same 2026-27 teaching season
-- and school/public holiday rules used by the recurring calendar.
create or replace function public.request_private_booking(
  p_coach_id uuid,
  p_session_date date,
  p_start_time time without time zone,
  p_duration_minutes integer,
  p_court_number smallint
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player uuid := auth.uid();
  v_id uuid;
  v_start timestamp;
  v_end timestamp;
  v_weekday smallint := extract(isodow from p_session_date)::smallint;
  v_school_holiday boolean := (
    p_session_date between date '2026-10-17' and date '2026-11-01'
    or p_session_date between date '2026-12-19' and date '2027-01-03'
    or p_session_date between date '2027-02-20' and date '2027-03-07'
    or p_session_date between date '2027-04-17' and date '2027-05-02'
  );
  v_public_holiday boolean := p_session_date in (
    date '2026-11-01',date '2026-11-11',date '2026-12-25',date '2027-01-01',
    date '2027-04-05',date '2027-05-01',date '2027-05-06',date '2027-05-08',date '2027-05-17'
  );
  v_first_holiday_saturday boolean := p_session_date in (
    date '2026-10-17',date '2026-12-19',date '2027-02-20',date '2027-04-17'
  );
begin
  if v_player is null or not public.is_player() then raise exception 'Connexion joueur requise.'; end if;
  if not exists (select 1 from public.profiles where id=p_coach_id and role='coach' and archived_at is null) then raise exception 'Coach invalide.'; end if;
  if not exists (select 1 from public.coach_players where coach_id=p_coach_id and player_id=v_player) then raise exception 'Ce coach ne suit pas ce joueur.'; end if;
  if p_duration_minutes not in (60,90,120) then raise exception 'Durée non autorisée.'; end if;
  if p_court_number not between 1 and 4 then raise exception 'Court invalide.'; end if;
  v_start := p_session_date + p_start_time;
  v_end := v_start + make_interval(mins => p_duration_minutes);
  if v_start < (timezone('Europe/Paris', now()) + interval '30 minutes') then
    raise exception 'La réservation doit être effectuée au moins 30 minutes avant le début du cours.';
  end if;

  -- Coach B's six confirmed recurring blocks, only during the club season
  -- and on dates when those groups are scheduled.
  if p_coach_id = '5360a637-eed3-4201-87f0-437f67baffac'::uuid
     and p_session_date between date '2026-09-14' and date '2027-06-20'
     and (
       (v_weekday=1 and not v_school_holiday and not v_public_holiday
        and p_start_time < time '21:00' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '18:00')
       or (v_weekday=2 and not v_school_holiday and not v_public_holiday and (
         (p_start_time < time '13:45' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '12:15')
         or (p_start_time < time '20:30' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '17:30')
       ))
       or (v_weekday=3 and not v_school_holiday
           and p_start_time < time '19:30' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '09:30')
       or (v_weekday=4 and not v_school_holiday and not v_public_holiday
           and p_start_time < time '19:30' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '18:00')
       or (v_weekday=6 and (not v_school_holiday or v_first_holiday_saturday)
           and p_start_time < time '13:30' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '09:30')
     ) then
    raise exception 'Ce créneau est bloqué par un cours collectif du Coach B.';
  end if;

  if not exists (
    select 1 from public.coach_weekly_availability a
    where a.coach_id=p_coach_id and a.weekday=v_weekday
      and a.active=true and a.start_time<=p_start_time
      and a.end_time>=(p_start_time+make_interval(mins=>p_duration_minutes))
      and (a.court_number is null or a.court_number=p_court_number)
  ) then raise exception 'Ce créneau ne fait pas partie des disponibilités publiées par le coach.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_coach_id::text||p_session_date::text||p_court_number::text,0));
  if exists (
    select 1 from public.shared_court_occupancy o
    where o.coach_id=p_coach_id and o.session_date=p_session_date
      and o.start_time<v_end::time and o.end_time>p_start_time
      and o.status not in ('cancelled','canceled','rejected','annulé','annule')
  ) then raise exception 'Le coach est déjà occupé par un cours collectif, un cours particulier ou une réservation.'; end if;
  if exists (
    select 1 from public.booking_requests b
    where b.coach_id=p_coach_id and b.session_date=p_session_date and b.court_number=p_court_number
      and b.status in ('pending','accepted')
      and (b.session_date+b.start_time)<v_end
      and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>v_start
  ) then raise exception 'Ce créneau est déjà demandé ou réservé.'; end if;
  insert into public.booking_requests(coach_id,player_id,session_date,start_time,duration_minutes,court_number,status)
  values(p_coach_id,v_player,p_session_date,p_start_time,p_duration_minutes,p_court_number,'pending')
  returning id into v_id;
  insert into public.coach_notifications(coach_id,player_id,notification_type,title,body,target_path)
  values(p_coach_id,v_player,'booking_request','Nouvelle demande de cours','Une demande de cours particulier attend ta réponse.','bookings');
  return v_id;
end;
$function$;
revoke all on function public.request_private_booking(uuid,date,time,integer,smallint) from public, anon;
grant execute on function public.request_private_booking(uuid,date,time,integer,smallint) to authenticated;
