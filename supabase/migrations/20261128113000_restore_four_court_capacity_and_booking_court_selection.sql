-- Restore Coach In club court capacity to the actual four courts.
-- Keep private booking RPC behavior aligned with production: the chosen court is
-- validated, stored, and used in cross-coach occupancy checks.
-- Unknown collective court allocations remain conservative and occupy all 4 courts.

alter table public.group_sessions
  drop constraint group_sessions_court_count_check,
  add constraint group_sessions_court_count_check
  check ((court_count between 1 and 4) or court_count is null);

alter table public.shared_court_occupancy
  drop constraint shared_court_occupancy_court_count_check,
  add constraint shared_court_occupancy_court_count_check
  check ((court_count between 1 and 4) or court_count is null);

CREATE OR REPLACE FUNCTION private.max_club_court_occupancy(p_start timestamp without time zone, p_end timestamp without time zone, p_exclude_source_kind text, p_exclude_source_id uuid, p_add_group_count smallint, p_add_shared_activity_id uuid, p_add_coach_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_max integer;
begin
  with points as (
    select p_start as at_time
    union
    select (o.session_date+o.start_time)::timestamp
    from public.shared_court_occupancy o
    where o.status in ('scheduled','pending','accepted','confirmed','completed')
      and (p_exclude_source_kind is null or p_exclude_source_id is null or not (o.source_kind=p_exclude_source_kind and o.source_id=p_exclude_source_id))
      and (o.session_date+o.start_time)>p_start
      and (o.session_date+o.start_time)<p_end
      and (o.session_date+o.end_time)>p_start
    union
    select (o.session_date+o.end_time)::timestamp
    from public.shared_court_occupancy o
    where o.status in ('scheduled','pending','accepted','confirmed','completed')
      and (p_exclude_source_kind is null or p_exclude_source_id is null or not (o.source_kind=p_exclude_source_kind and o.source_id=p_exclude_source_id))
      and (o.session_date+o.start_time)<p_end
      and (o.session_date+o.end_time)>p_start
      and (o.session_date+o.end_time)<p_end
  ), totals as (
    select points.at_time,coalesce(sum(activity.occupied_courts),0)::integer as occupied_courts
    from points
    cross join lateral (
      with active_rows as (
        select
          case when o.source_kind='group_session'
            then coalesce(o.shared_activity_id::text,'group:'||o.id::text)
            else 'private:'||o.id::text end as activity_key,
          case when o.source_kind='group_session' then o.shared_activity_id else null::uuid end as shared_activity_id,
          case when o.source_kind='group_session' then o.coach_id else null::uuid end as coach_id,
          o.court_count
        from public.shared_court_occupancy o
        where o.status in ('scheduled','pending','accepted','confirmed','completed')
          and (p_exclude_source_kind is null or p_exclude_source_id is null or not (o.source_kind=p_exclude_source_kind and o.source_id=p_exclude_source_id))
          and (o.session_date+o.start_time)<=points.at_time
          and (o.session_date+o.end_time)>points.at_time
        union all
        select
          coalesce(p_add_shared_activity_id::text,'new:'||coalesce(p_add_coach_id::text,'unknown')||':'||points.at_time::text),
          p_add_shared_activity_id,p_add_coach_id,p_add_group_count
        where coalesce(p_add_group_count,0)>0
      ), per_coach as (
        select activity_key,shared_activity_id,coach_id,
               bool_or(court_count is null) as unknown,
               coalesce(sum(court_count),0)::integer as coach_courts
        from active_rows
        group by activity_key,shared_activity_id,coach_id
      ), per_activity as (
        select activity_key,shared_activity_id,
               bool_or(unknown) as unknown,
               case when bool_or(unknown) then 4
                    when shared_activity_id is not null then max(coach_courts)
                    else sum(coach_courts) end as occupied_courts
        from per_coach
        group by activity_key,shared_activity_id
      )
      select coalesce(sum(occupied_courts),0)::integer as occupied_courts
      from per_activity
    ) activity
    group by points.at_time
  )
  select coalesce(max(occupied_courts),0)::integer into v_max from totals;
  return v_max;
end;
$function$


CREATE OR REPLACE FUNCTION private.get_club_court_capacity(p_start_date date, p_end_date date)
 RETURNS TABLE(session_date date, slot_start time without time zone, occupied_courts integer, available_courts integer, capacity_known boolean, shared_plateau boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not (public.is_coach() or public.is_player()) then
    raise exception 'Connexion requise.';
  end if;
  if public.is_player() and not exists (
    select 1 from public.coach_players cp where cp.player_id=auth.uid()
  ) then
    raise exception 'Aucun coach associé à ce compte.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date
     or p_end_date>p_start_date+366 then
    raise exception 'Période de consultation invalide.';
  end if;

  return query
  select d.day::date,slots.slot_start::time,
         coalesce(cap.occupied_courts,0)::integer,
         greatest(0,4-coalesce(cap.occupied_courts,0))::integer,
         not coalesce(cap.unknown,false),
         coalesce(cap.shared_plateau,false)
  from generate_series(p_start_date::timestamp,p_end_date::timestamp,interval '1 day') as d(day)
  cross join lateral generate_series(d.day+time '08:00',d.day+time '21:30',interval '30 minutes') as slots(slot_start)
  left join lateral (
    with active_rows as (
      select
        case when o.source_kind='group_session'
          then coalesce(o.shared_activity_id::text,'group:'||o.id::text)
          else 'private:'||o.id::text end as activity_key,
        case when o.source_kind='group_session' then o.shared_activity_id else null::uuid end as shared_activity_id,
        case when o.source_kind='group_session' then o.coach_id else null::uuid end as coach_id,
        o.court_count
      from public.shared_court_occupancy o
      where o.status in ('scheduled','pending','accepted','confirmed','completed')
        and o.session_date=d.day::date
        and (o.session_date+o.start_time)<slots.slot_start+interval '30 minutes'
        and (o.session_date+o.end_time)>slots.slot_start
    ), per_coach as (
      select activity_key,shared_activity_id,coach_id,
             bool_or(court_count is null) as unknown,
             coalesce(sum(court_count),0)::integer as coach_courts
      from active_rows
      group by activity_key,shared_activity_id,coach_id
    ), per_activity as (
      select activity_key,shared_activity_id,
             bool_or(unknown) as unknown,
             case when bool_or(unknown) then 4
                  when shared_activity_id is not null then max(coach_courts)
                  else sum(coach_courts) end as occupied_courts,
             count(distinct coach_id) as coach_count
      from per_coach
      group by activity_key,shared_activity_id
    )
    select coalesce(bool_or(pa.unknown),false) as unknown,
           case when coalesce(bool_or(pa.unknown),false) then 4
                else coalesce(sum(pa.occupied_courts),0)::integer end as occupied_courts,
           coalesce(bool_or(pa.shared_activity_id is not null and pa.coach_count>1 and pa.occupied_courts>=3),false) as shared_plateau
    from per_activity pa
  ) cap on true
  order by d.day,slots.slot_start;
end;
$function$


CREATE OR REPLACE FUNCTION private.guard_group_shared_court_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_start timestamp;
  v_end timestamp;
  v_max integer;
begin
  if new.status in ('scheduled','completed') then
    if new.court_count is null then raise exception 'Indique le nombre de terrains mobilisés pour ce cours collectif.'; end if;
    v_start:=new.session_date+new.start_time;
    v_end:=new.session_date+new.end_time;
    perform pg_advisory_xact_lock(hashtextextended('club-courts:'||new.session_date::text,0));

    if exists (
      select 1 from public.group_sessions g
      where g.coach_id=new.coach_id and g.session_date=new.session_date
        and g.id is distinct from new.id
        and g.status in ('scheduled','completed')
        and (g.session_date+g.start_time)<v_end
        and (g.session_date+g.end_time)>v_start
        and not (g.start_time=new.start_time and g.end_time=new.end_time and g.audience=new.audience)
    ) then
      raise exception 'Ce coach a déjà un autre cours collectif sur ce créneau.';
    end if;

    if exists (
      select 1 from public.booking_requests b
      where b.coach_id=new.coach_id and b.session_date=new.session_date
        and b.status in ('pending','accepted')
        and (b.session_date+b.start_time)<v_end
        and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>v_start
    ) or exists (
      select 1 from public.training_sessions s
      where s.created_by=new.coach_id and s.session_date=new.session_date
        and (s.session_date+coalesce(s.session_time,time '00:00'))<v_end
        and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60)))>v_start
        and lower(coalesce(s.status,'')) not in ('annulée','annulee','annule','annulé','cancelled','canceled')
    ) then
      raise exception 'Ce coach a déjà un cours particulier sur ce créneau.';
    end if;

    v_max:=private.max_club_court_occupancy(
      v_start,v_end,'group_session',new.id,new.court_count,new.shared_activity_id,new.coach_id
    );
    if v_max>4 then
      raise exception 'Les terrains disponibles ne permettent pas ce cours collectif en plus des cours particuliers déjà réservés.';
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION private.guard_training_shared_court_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_start timestamp;
  v_end timestamp;
  v_max integer;
begin
  if new.session_time is not null
     and lower(coalesce(new.status,'')) not in ('annulée','annulee','annule','annulé','cancelled','canceled') then
    v_start:=new.session_date+new.session_time;
    v_end:=v_start+make_interval(mins=>new.duration_minutes);
    perform pg_advisory_xact_lock(hashtextextended('club-courts:'||new.session_date::text,0));
    if exists (
      select 1 from public.group_sessions g
      where g.coach_id=new.created_by and g.session_date=new.session_date
        and g.status in ('scheduled','completed')
        and (g.session_date+g.start_time)<v_end
        and (g.session_date+g.end_time)>v_start
    ) or exists (
      select 1 from public.booking_requests b
      where b.coach_id=new.created_by and b.session_date=new.session_date
        and b.status in ('pending','accepted')
        and (b.session_date+b.start_time)<v_end
        and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>v_start
    ) or exists (
      select 1 from public.training_sessions s
      where s.created_by=new.created_by and s.id is distinct from new.id
        and s.session_date=new.session_date
        and (s.session_date+coalesce(s.session_time,time '00:00'))<v_end
        and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60)))>v_start
        and lower(coalesce(s.status,'')) not in ('annulée','annulee','annule','annulé','cancelled','canceled')
    ) then
      raise exception 'Le coach a déjà une autre séance sur ce créneau.';
    end if;

    v_max:=private.max_club_court_occupancy(v_start,v_end,'private_session',new.id,0::smallint);
    if v_max+1>4 then
      raise exception 'Les quatre terrains sont déjà occupés sur une partie de ce créneau.';
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_booking_shared_court_occupancy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then
    delete from public.shared_court_occupancy where source_kind='booking' and source_id=old.id;
    return old;
  end if;
  if new.status in ('pending','accepted') then
    insert into public.shared_court_occupancy
      (coach_id,session_date,start_time,end_time,court_number,court_count,audience,source_kind,source_id,status)
    values
      (new.coach_id,new.session_date,new.start_time,
       new.start_time + make_interval(mins=>new.duration_minutes),
       new.court_number,1,null,'booking',new.id,new.status)
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=excluded.court_number,court_count=1,audience=null,status=excluded.status;
  else
    delete from public.shared_court_occupancy where source_kind='booking' and source_id=new.id;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_training_shared_court_occupancy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then
    delete from public.shared_court_occupancy where source_kind='private_session' and source_id=old.id;
    return old;
  end if;
  if new.session_time is not null
     and lower(coalesce(new.status,'')) not in ('annulée','annulee','annule','annulé','cancelled','canceled') then
    insert into public.shared_court_occupancy
      (coach_id,session_date,start_time,end_time,court_number,court_count,audience,source_kind,source_id,status)
    values
      (new.created_by,new.session_date,new.session_time,
       new.session_time + make_interval(mins=>new.duration_minutes),
       new.court_number,1,null,'private_session',new.id,'scheduled')
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=excluded.court_number,court_count=1,audience=null,status=excluded.status;
  else
    delete from public.shared_court_occupancy where source_kind='private_session' and source_id=new.id;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION private.request_private_booking(p_coach_id uuid, p_session_date date, p_start_time time without time zone, p_duration_minutes integer, p_court_number smallint DEFAULT NULL::smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid := auth.uid();
  v_id uuid;
  v_start timestamp;
  v_end timestamp;
begin
  if v_player is null or not public.is_player() then
    raise exception 'Connexion joueur requise.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_coach_id and role = 'coach' and archived_at is null
  ) then
    raise exception 'Coach invalide.';
  end if;

  if not exists (
    select 1 from public.coach_players cp
    where cp.coach_id = p_coach_id
      and cp.player_id = v_player
  ) then
    raise exception 'Tu dois être lié à ce coach pour réserver un cours.';
  end if;
  if p_duration_minutes not in (60, 90, 120) then
    raise exception 'Durée non autorisée.';
  end if;
  if p_court_number is null or p_court_number not between 1 and 4 then
    raise exception 'Court invalide.';
  end if;

  v_start := p_session_date + p_start_time;
  v_end := v_start + make_interval(mins => p_duration_minutes);

  if v_start < (now() at time zone 'Europe/Paris') + interval '30 minutes' then
    raise exception 'La réservation doit être effectuée au moins 30 minutes avant le début du cours.';
  end if;

  if not exists (
    select 1
    from public.coach_weekly_availability a
    where a.coach_id = p_coach_id
      and a.weekday = extract(isodow from p_session_date)::smallint
      and a.active = true
      and a.start_time <= p_start_time
      and a.end_time >= (p_start_time + make_interval(mins => p_duration_minutes))
      and (a.court_number is null or a.court_number = p_court_number)
  ) then
    raise exception 'Ce créneau ne fait pas partie des disponibilités publiées par le coach.';
  end if;

  -- Global court/day lock: two different coaches cannot race for the same court.
  perform pg_advisory_xact_lock(
    hashtextextended(p_session_date::text || ':' || p_court_number::text, 0)
  );

  if exists (
    select 1 from public.booking_requests b
    where b.coach_id = p_coach_id
      and b.session_date = p_session_date
      and b.court_number = p_court_number
      and b.status in ('pending', 'accepted')
      and (b.session_date + b.start_time) < v_end
      and (b.session_date + b.start_time + make_interval(mins => b.duration_minutes)) > v_start
  ) then
    raise exception 'Ce créneau est déjà demandé ou réservé.';
  end if;

  if exists (
    select 1 from public.training_sessions s
    where s.created_by = p_coach_id
      and s.session_date = p_session_date
      and coalesce(s.court_number, p_court_number) = p_court_number
      and (s.session_date + coalesce(s.session_time, time '00:00')) < v_end
      and (s.session_date + coalesce(s.session_time, time '00:00') + make_interval(mins => coalesce(s.duration_minutes, 60))) > v_start
  ) then
    raise exception 'Le coach a déjà une séance sur ce créneau.';
  end if;

  if exists (
    select 1 from public.group_sessions g
    where g.coach_id = p_coach_id
      and g.session_date = p_session_date
      and g.status <> 'cancelled'
      and (g.session_date + g.start_time) < v_end
      and (g.session_date + g.end_time) > v_start
  ) then
    raise exception 'Le coach est indisponible : un cours collectif est prévu sur ce créneau.';
  end if;

  -- A null court number means the other coach's collective occupies an
  -- unspecified court; conservatively block every court for the overlap.
  if exists (
    select 1 from public.shared_court_occupancy o
    where o.coach_id is distinct from p_coach_id
      and o.session_date = p_session_date
      and o.status not in ('cancelled', 'canceled', 'rejected', 'annulé', 'annulee')
      and (o.court_number is null or o.court_number = p_court_number)
      and (o.session_date + o.start_time) < v_end
      and (o.session_date + o.end_time) > v_start
  ) then
    raise exception 'Conflit de terrain : un autre coach occupe déjà ce créneau.';
  end if;

  insert into public.booking_requests (
    coach_id, player_id, session_date, start_time, duration_minutes, court_number, status
  )
  values (
    p_coach_id, v_player, p_session_date, p_start_time, p_duration_minutes, p_court_number, 'pending'
  )
  returning id into v_id;

  insert into public.coach_notifications (
    coach_id, player_id, notification_type, title, body, target_path
  )
  values (
    p_coach_id, v_player, 'booking_request',
    'Nouvelle demande de cours',
    'Une demande de cours particulier attend ta réponse.',
    'bookings'
  );

  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.review_private_booking(p_request_id uuid, p_decision text, p_coach_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_booking public.booking_requests%rowtype;
  v_first_name text;
  v_when text;
  v_enabled boolean := true;
  v_start timestamp;
  v_end timestamp;
begin
  if auth.uid() is null or not public.is_coach() then
    raise exception 'Connexion coach requise.';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Décision invalide.';
  end if;

  select * into v_booking
  from public.booking_requests
  where id = p_request_id
  for update;

  if not found or v_booking.coach_id <> auth.uid() then
    raise exception 'Demande introuvable.';
  end if;
  if v_booking.status <> 'pending' then
    raise exception 'Cette demande a déjà été traitée.';
  end if;

  if p_decision = 'accepted' then
    v_start := v_booking.session_date + v_booking.start_time;
    v_end := v_start + make_interval(mins => v_booking.duration_minutes);

    if v_start < (now() at time zone 'Europe/Paris') + interval '30 minutes' then
      raise exception 'Impossible de confirmer un cours à moins de 30 minutes de son début.';
    end if;

    if not exists (
      select 1 from public.coach_players cp
      where cp.coach_id = v_booking.coach_id
        and cp.player_id = v_booking.player_id
      ) then
      raise exception 'Impossible de confirmer : le joueur n’est plus lié à ce coach.';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(v_booking.session_date::text || ':' || v_booking.court_number::text, 0)
    );

    if exists (
      select 1 from public.booking_requests b
      where b.id <> v_booking.id
        and b.coach_id = v_booking.coach_id
        and b.session_date = v_booking.session_date
        and b.court_number = v_booking.court_number
        and b.status in ('pending', 'accepted')
        and (b.session_date + b.start_time) < v_end
        and (b.session_date + b.start_time + make_interval(mins => b.duration_minutes)) > v_start
    ) then
      raise exception 'Conflit : le créneau a été réservé entre-temps.';
    end if;

    if exists (
      select 1 from public.training_sessions s
      where s.created_by = v_booking.coach_id
        and s.session_date = v_booking.session_date
        and coalesce(s.court_number, v_booking.court_number) = v_booking.court_number
        and (s.session_date + coalesce(s.session_time, time '00:00')) < v_end
        and (s.session_date + coalesce(s.session_time, time '00:00') + make_interval(mins => coalesce(s.duration_minutes, 60))) > v_start
    ) then
      raise exception 'Conflit : le coach a ajouté une séance sur ce créneau.';
    end if;

    if exists (
      select 1 from public.group_sessions g
      where g.coach_id = v_booking.coach_id
        and g.session_date = v_booking.session_date
        and g.status <> 'cancelled'
        and (g.session_date + g.start_time) < v_end
        and (g.session_date + g.end_time) > v_start
    ) then
      raise exception 'Conflit : un cours collectif occupe ce créneau.';
    end if;

    if exists (
      select 1 from public.shared_court_occupancy o
      where o.coach_id is distinct from v_booking.coach_id
        and o.session_date = v_booking.session_date
        and o.status not in ('cancelled', 'canceled', 'rejected', 'annulé', 'annulee')
        and (o.court_number is null or o.court_number = v_booking.court_number)
        and (o.session_date + o.start_time) < v_end
        and (o.session_date + o.end_time) > v_start
    ) then
      raise exception 'Conflit de terrain : un autre coach occupe déjà ce créneau.';
    end if;
  end if;

  update public.booking_requests
  set status = p_decision, coach_note = coalesce(p_coach_note, ''), reviewed_at = now()
  where id = p_request_id;

  select coalesce(nullif(trim(first_name), ''), '')
  into v_first_name
  from public.profiles
  where id = v_booking.player_id;

  v_when := pg_catalog.to_char(v_booking.session_date, 'DD/MM/YYYY')
    || ' à ' || pg_catalog.to_char(v_booking.start_time, 'HH24:MI');

  select coalesce(booking_decisions, true)
  into v_enabled
  from public.notification_preferences
  where user_id = v_booking.player_id;
  if not found then v_enabled := true; end if;

  if v_enabled then
    insert into public.player_notifications (
      player_id, coach_id, notification_type, title, body, target_path, source_id
    )
    values (
      v_booking.player_id, v_booking.coach_id, 'booking_decision',
      case when p_decision = 'accepted'
        then case when v_first_name <> '' then v_first_name || ', ton cours est confirmé !' else 'Ton cours est confirmé !' end
        else case when v_first_name <> '' then v_first_name || ', ta demande de cours a été refusée' else 'Demande de cours refusée' end
      end,
      case when p_decision = 'accepted'
        then 'Ton cours particulier est confirmé pour le ' || v_when
          || ' · durée : ' || v_booking.duration_minutes || ' min · court ' || v_booking.court_number || '.'
        else 'Ta demande de cours particulier du ' || v_when || ' n’a pas été acceptée.'
      end,
      'bookings', v_booking.id
    );
  end if;
end;
$function$


-- Reconcile derived occupancy rows where the source row has a known court.
update public.shared_court_occupancy o
set court_number = b.court_number,
    court_count = 1,
    audience = null
from public.booking_requests b
where o.source_kind = 'booking'
  and o.source_id = b.id
  and b.court_number is not null;

update public.shared_court_occupancy o
set court_number = s.court_number,
    court_count = 1,
    audience = null
from public.training_sessions s
where o.source_kind = 'private_session'
  and o.source_id = s.id
  and s.court_number is not null;
