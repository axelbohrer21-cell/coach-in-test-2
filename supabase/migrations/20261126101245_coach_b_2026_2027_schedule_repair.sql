-- Repair Coach B's 2026-2027 calendar in production and preproduction.
-- The schedule is resolved by the coach's email, never by an environment-specific UUID.
-- Collective sessions are materialized so both coach and player calendars read the same source of truth.

create or replace function public.guard_coach_in_schedule_dates()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_day integer;
  v_stage boolean := false;
  v_vacation_saturday boolean := false;
  v_coach_b_id uuid;
  v_coach_b_vacation_saturday boolean := false;
begin
  if tg_table_name in ('training_sessions','booking_requests') then
    if not public.is_private_lesson_date_allowed(new.session_date) then
      raise exception 'Les cours particuliers sont suspendus le dimanche, pendant les vacances scolaires et les jours fériés (sauf le 8 mai).';
    end if;
  elsif tg_table_name='group_sessions' then
    if new.session_date between date '2026-09-14' and date '2027-06-20'
       and coalesce(new.status,'scheduled') <> 'cancelled' then
      v_day := extract(isodow from new.session_date)::integer;
      select id into v_coach_b_id
      from public.profiles
      where lower(email)='coachb@gmail.com' and role='coach' and archived_at is null
      limit 1;

      v_stage := new.audience='enfants'
        and new.theme='Stage enfants'
        and public.is_zone_b_school_holiday(new.session_date)
        and v_day between 1 and 5
        and new.start_time=time '09:30'
        and new.end_time=time '16:30'
        and new.court_number between 1 and 3;

      v_coach_b_vacation_saturday :=
        new.coach_id=v_coach_b_id
        and new.audience='enfants'
        and new.session_date in (date '2026-10-17',date '2026-12-19',date '2027-02-20',date '2027-04-17')
        and v_day=6
        and new.start_time=time '09:30'
        and new.end_time=time '13:30'
        and new.court_number is null;

      v_vacation_saturday :=
        (new.audience='enfants'
         and new.session_date in (date '2026-10-17',date '2026-12-19',date '2027-02-20',date '2027-04-17')
         and v_day=6
         and new.start_time=time '09:30'
         and new.end_time=time '14:30'
         and new.court_number between 1 and 3)
        or v_coach_b_vacation_saturday;

      if new.session_date in (date '2026-11-02',date '2026-11-12') then
        raise exception 'Tous les cours collectifs sont annulés à cette date.';
      end if;

      if public.is_zone_b_school_holiday(new.session_date) and not (v_stage or v_vacation_saturday) then
        raise exception 'Aucun cours collectif hebdomadaire pendant les vacances scolaires Zone B.';
      end if;

      if new.audience='adultes' then
        if v_day not in (1,2,3,4,5) then
          raise exception 'Les cours collectifs adultes sont prévus du lundi au vendredi.';
        end if;
        if new.session_date in (
          date '2026-11-01',date '2026-11-11',date '2026-12-25',date '2027-01-01',
          date '2027-04-05',date '2027-05-01',date '2027-05-06',date '2027-05-08',date '2027-05-17'
        ) then
          raise exception 'Aucun cours collectif adulte les jours fériés.';
        end if;
      elsif new.audience='enfants' then
        if v_stage then
          if new.session_date in (date '2026-12-25',date '2027-01-01') then
            raise exception 'Aucun stage les jours fériés.';
          end if;
        elsif v_vacation_saturday then
          null;
        else
          if v_day not in (3,6) then
            raise exception 'Les cours collectifs enfants sont prévus les mercredis et samedis.';
          end if;
          if public.is_zone_b_school_holiday(new.session_date) then
            raise exception 'Les cours enfants hebdomadaires sont suspendus pendant les vacances.';
          end if;
          if new.end_time<=new.start_time
             or (v_day=3 and (new.start_time<time '09:30' or new.end_time>time '18:00'))
             or (v_day=6 and (new.start_time<time '09:30' or new.end_time>time '14:30')) then
            raise exception 'Les cours enfants doivent respecter les horaires du mercredi (9 h 30–18 h) ou du samedi (9 h 30–14 h 30).';
          end if;
        end if;
      else
        raise exception 'Public du cours collectif invalide.';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

do $$
declare
  v_coach_id uuid;
begin
  select id into v_coach_id
  from public.profiles
  where lower(email)='coachb@gmail.com' and role='coach' and archived_at is null
  limit 1;

  if v_coach_id is null then
    raise exception 'Coach B (coachb@gmail.com) introuvable ou inactif.';
  end if;

  update public.coach_weekly_availability a
  set active=true
  where a.coach_id=v_coach_id
    and (a.weekday,a.start_time,a.end_time) in (
      (1,time '18:00',time '21:00'),
      (2,time '12:15',time '13:45'),
      (2,time '17:30',time '20:30'),
      (3,time '09:30',time '19:30'),
      (4,time '18:00',time '19:30'),
      (5,time '08:00',time '22:00'),
      (6,time '09:30',time '13:30')
    );

  insert into public.coach_weekly_availability
    (coach_id,weekday,start_time,end_time,court_number,active)
  select v_coach_id,v.weekday,v.start_time,v.end_time,null,true
  from (values
    (1::smallint,time '18:00',time '21:00'),
    (2::smallint,time '12:15',time '13:45'),
    (2::smallint,time '17:30',time '20:30'),
    (3::smallint,time '09:30',time '19:30'),
    (4::smallint,time '18:00',time '19:30'),
    (5::smallint,time '08:00',time '22:00'),
    (6::smallint,time '09:30',time '13:30')
  ) as v(weekday,start_time,end_time)
  where not exists (
    select 1 from public.coach_weekly_availability a
    where a.coach_id=v_coach_id
      and a.weekday=v.weekday
      and a.start_time=v.start_time
      and a.end_time=v.end_time
  );

  with dates as (
    select d::date as session_date
    from generate_series(date '2026-09-14',date '2027-06-20',interval '1 day') d
  ),
  blocks as (
    select session_date,'adultes'::text audience,time '18:00' start_time,time '21:00' end_time
    from dates where extract(isodow from session_date)=1
    union all
    select session_date,'adultes',time '12:15',time '13:45'
    from dates where extract(isodow from session_date)=2
    union all
    select session_date,'adultes',time '17:30',time '20:30'
    from dates where extract(isodow from session_date)=2
    union all
    select session_date,'enfants',time '09:30',time '18:00'
    from dates where extract(isodow from session_date)=3
    union all
    select session_date,'adultes',time '18:00',time '19:30'
    from dates where extract(isodow from session_date)=3
    union all
    select session_date,'adultes',time '18:00',time '19:30'
    from dates where extract(isodow from session_date)=4
    union all
    select session_date,'enfants',time '09:30',time '13:30'
    from dates where extract(isodow from session_date)=6
  ),
  eligible as (
    select * from blocks b
    where session_date not in (date '2026-11-02',date '2026-11-12')
      and (
        (audience='adultes'
          and not public.is_zone_b_school_holiday(session_date)
          and session_date not in (
            date '2026-11-01',date '2026-11-11',date '2026-12-25',date '2027-01-01',
            date '2027-04-05',date '2027-05-01',date '2027-05-06',date '2027-05-08',date '2027-05-17'
          ))
        or
        (audience='enfants'
          and (not public.is_zone_b_school_holiday(session_date)
            or session_date in (date '2026-10-17',date '2026-12-19',date '2027-02-20',date '2027-04-17')))
      )
  )
  insert into public.group_sessions
    (coach_id,title,theme,session_date,start_time,end_time,court_number,audience,status,series_id)
  select v_coach_id,'Cours collectif','Bloc collectif récurrent Coach B',
         e.session_date,e.start_time,e.end_time,null,e.audience,'scheduled',null
  from eligible e
  where not exists (
    select 1 from public.group_sessions g
    where g.coach_id=v_coach_id
      and g.session_date=e.session_date
      and g.start_time=e.start_time
      and g.end_time=e.end_time
      and g.audience=e.audience
  );

  insert into public.group_sessions
    (coach_id,title,theme,session_date,start_time,end_time,court_number,audience,status,series_id)
  select v_coach_id,'Cours collectif','Annulation exceptionnelle Coach B',
         x.session_date,x.start_time,x.end_time,null,'adultes','cancelled',null
  from (values
    (date '2026-11-02',time '18:00',time '21:00'),
    (date '2026-11-12',time '18:00',time '19:30')
  ) as x(session_date,start_time,end_time)
  where not exists (
    select 1 from public.group_sessions g
    where g.coach_id=v_coach_id
      and g.session_date=x.session_date
      and g.start_time=x.start_time
      and g.end_time=x.end_time
  );
end $$;
