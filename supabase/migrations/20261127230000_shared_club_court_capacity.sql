-- Shared club capacity: count occupied courts, never assign a fixed court number.
alter table public.group_sessions
  add column if not exists court_count smallint default 1;
alter table public.group_sessions alter column court_count drop not null, alter column court_count drop default;
alter table public.group_course_series
  add column if not exists court_count smallint not null default 1,
  alter column court_number drop not null;
alter table public.shared_court_occupancy
  add column if not exists court_count smallint,
  alter column court_count drop not null,
  alter column court_count drop default,
  add column if not exists audience text;
alter table public.booking_requests
  add column if not exists court_count smallint not null default 1;
alter table public.training_sessions
  add column if not exists court_count smallint not null default 1;

alter table public.group_sessions drop constraint if exists group_sessions_court_count_check;
alter table public.group_sessions add constraint group_sessions_court_count_check check (court_count between 1 and 3 or court_count is null);
alter table public.group_course_series drop constraint if exists group_course_series_court_count_check;
alter table public.group_course_series add constraint group_course_series_court_count_check check (court_count between 1 and 3);
alter table public.shared_court_occupancy drop constraint if exists shared_court_occupancy_court_count_check;
alter table public.shared_court_occupancy add constraint shared_court_occupancy_court_count_check check (court_count between 1 and 3 or court_count is null);
alter table public.booking_requests drop constraint if exists booking_requests_court_count_check;
alter table public.booking_requests add constraint booking_requests_court_count_check check (court_count = 1);
alter table public.training_sessions drop constraint if exists training_sessions_court_count_check;
alter table public.training_sessions add constraint training_sessions_court_count_check check (court_count = 1);

-- Temporarily remove the capacity guard while normalizing legacy blocks; it is recreated below.
drop trigger if exists guard_group_shared_court_capacity on public.group_sessions;

-- Coach B: one collective block per actual lesson, with only confirmed capacity.
update public.group_sessions g
set court_count = case
  when extract(isodow from g.session_date)::int=2 and g.start_time=time '19:00' and g.end_time=time '20:30' then 3
  else null
end
from public.profiles p where p.id=g.coach_id and lower(p.email)='coachb@gmail.com';

-- Split Coach B Tuesday evening into the two real lessons.
insert into public.group_sessions
  (coach_id,title,theme,session_date,start_time,end_time,audience,status,source_week,series_id,court_number,court_count)
select g.coach_id,g.title,g.theme,g.session_date,time '19:00',time '20:30',g.audience,g.status,
       g.source_week,g.series_id,null,3
from public.group_sessions g
join public.profiles p on p.id=g.coach_id
where lower(p.email)='coachb@gmail.com'
  and extract(isodow from g.session_date)::int = 2
  and g.start_time = time '17:30'
  and g.end_time = time '20:30'
  and not exists (
    select 1 from public.group_sessions existing
    where existing.coach_id=g.coach_id and existing.session_date=g.session_date
      and existing.start_time=time '19:00' and existing.end_time=time '20:30'
      and existing.audience=g.audience and existing.title=g.title and existing.status=g.status
  );

update public.group_sessions g
set end_time = time '19:00', court_count = null, court_number = null
from public.profiles p where p.id=g.coach_id and lower(p.email)='coachb@gmail.com'
  and extract(isodow from g.session_date)::int = 2
  and g.start_time = time '17:30'
  and g.end_time = time '20:30';

-- The shared occupancy ledger carries only capacity and audience metadata.
create or replace function public.sync_group_shared_court_occupancy()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.shared_court_occupancy
    where source_kind='group_session' and source_id=old.id;
    return old;
  end if;

  if new.status in ('scheduled','completed') then
    insert into public.shared_court_occupancy
      (coach_id,session_date,start_time,end_time,court_number,court_count,audience,source_kind,source_id,status)
    values
      (new.coach_id,new.session_date,new.start_time,new.end_time,new.court_number,
       new.court_count,new.audience,'group_session',new.id,
       case when new.status='completed' then 'completed' else 'scheduled' end)
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=excluded.court_number,court_count=excluded.court_count,
      audience=excluded.audience,status=excluded.status;
  else
    delete from public.shared_court_occupancy
    where source_kind='group_session' and source_id=new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.sync_booking_shared_court_occupancy()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
       null,1,null,'booking',new.id,new.status)
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=null,court_count=1,audience=null,status=excluded.status;
  else
    delete from public.shared_court_occupancy where source_kind='booking' and source_id=new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.sync_training_shared_court_occupancy()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
       null,1,null,'private_session',new.id,'scheduled')
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=null,court_count=1,audience=null,status=excluded.status;
  else
    delete from public.shared_court_occupancy where source_kind='private_session' and source_id=new.id;
  end if;
  return new;
end;
$function$;

-- Backfill the shared ledger after the new court-count metadata is present.
update public.shared_court_occupancy o
set court_count = case
      when o.source_kind='group_session' then g.court_count
      else 1
    end,
    audience = case when o.source_kind='group_session' then g.audience else null end
from public.group_sessions g
where o.source_kind='group_session' and o.source_id=g.id;

insert into public.shared_court_occupancy
  (coach_id,session_date,start_time,end_time,court_number,court_count,audience,source_kind,source_id,status)
select g.coach_id,g.session_date,g.start_time,g.end_time,g.court_number,g.court_count,g.audience,
       'group_session',g.id,case when g.status='completed' then 'completed' else 'scheduled' end
from public.group_sessions g
where g.status in ('scheduled','completed')
on conflict (source_kind,source_id) do update set
  coach_id=excluded.coach_id,session_date=excluded.session_date,start_time=excluded.start_time,
  end_time=excluded.end_time,court_number=excluded.court_number,court_count=excluded.court_count,
  audience=excluded.audience,status=excluded.status;

update public.shared_court_occupancy
set court_count=1,audience=null
where source_kind in ('booking','private_session');

create or replace function private.max_club_court_occupancy(
  p_start timestamp without time zone,
  p_end timestamp without time zone,
  p_exclude_source_kind text default null,
  p_exclude_source_id uuid default null,
  p_add_group_count smallint default 0
)
returns integer
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_max integer;
begin
  select coalesce(max(x.group_occupied + coalesce(p_add_group_count,3) + x.private_occupied),0)::integer
  into v_max
  from (
    select points.at_time,
      coalesce(sum(case when o.court_count is null then 3 else o.court_count end) filter (where o.source_kind='group_session'),0)::integer as group_occupied,
      coalesce(sum(case when o.court_count is null then 3 else o.court_count end) filter (where o.source_kind<>'group_session'),0)::integer as private_occupied
    from (
      select p_start as at_time
      union
      select (o.session_date + o.start_time)::timestamp
      from public.shared_court_occupancy o
      where o.status in ('scheduled','pending','accepted','confirmed','completed')
        and (p_exclude_source_kind is null or p_exclude_source_id is null or not (o.source_kind=p_exclude_source_kind and o.source_id=p_exclude_source_id))
        and (o.session_date + o.start_time) < p_end
        and (o.session_date + o.end_time) > p_start
      union
      select (o.session_date + o.end_time)::timestamp
      from public.shared_court_occupancy o
      where o.status in ('scheduled','pending','accepted','confirmed','completed')
        and (p_exclude_source_kind is null or p_exclude_source_id is null or not (o.source_kind=p_exclude_source_kind and o.source_id=p_exclude_source_id))
        and (o.session_date + o.start_time) < p_end
        and (o.session_date + o.end_time) > p_start
        and (o.session_date + o.end_time) < p_end
    ) points
    left join public.shared_court_occupancy o
      on o.status in ('scheduled','pending','accepted','confirmed','completed')
     and (p_exclude_source_kind is null or p_exclude_source_id is null or not (o.source_kind=p_exclude_source_kind and o.source_id=p_exclude_source_id))
     and (o.session_date + o.start_time) <= points.at_time
     and (o.session_date + o.end_time) > points.at_time
    group by points.at_time
  ) x;
  return v_max;
end;
$function$;

create or replace function private.guard_group_shared_court_capacity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
        and not (
          g.start_time=new.start_time and g.end_time=new.end_time
          and g.audience=new.audience
        )
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

    v_max:=private.max_club_court_occupancy(v_start,v_end,'group_session',new.id,new.court_count);
    if v_max>3 then
      raise exception 'Les terrains disponibles ne permettent pas ce cours collectif en plus des cours particuliers déjà réservés.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_group_shared_court_capacity on public.group_sessions;
create trigger guard_group_shared_court_capacity
before insert or update on public.group_sessions
for each row execute function private.guard_group_shared_court_capacity();

create or replace function private.guard_training_shared_court_capacity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
    if v_max+1>3 then
      raise exception 'Les trois terrains sont déjà occupés sur une partie de ce créneau.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_training_shared_court_capacity on public.training_sessions;
create trigger guard_training_shared_court_capacity
before insert or update on public.training_sessions
for each row execute function private.guard_training_shared_court_capacity();

revoke all on function private.max_club_court_occupancy(timestamp without time zone,timestamp without time zone,text,uuid,smallint) from public,anon,authenticated;
revoke all on function private.guard_group_shared_court_capacity() from public,anon,authenticated;
revoke all on function private.guard_training_shared_court_capacity() from public,anon,authenticated;

drop function if exists public.get_club_court_capacity(date,date);

create function public.get_club_court_capacity(p_start_date date,p_end_date date)
returns table(session_date date,slot_start time without time zone,occupied_courts integer,available_courts integer,capacity_known boolean)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not (public.is_coach() or public.is_player()) then
    raise exception 'Connexion requise.';
  end if;
  if public.is_player() and not exists (
    select 1 from public.coach_players cp where cp.player_id=auth.uid()
  ) then
    raise exception 'Aucun coach associé à ce compte.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date > p_start_date + 366 then
    raise exception 'Période de consultation invalide.';
  end if;

  return query
  select d.day::date,
         slots.slot_start::time,
         case when coalesce(bool_or(o.id is not null and o.court_count is null),false) then 3
              else (coalesce(sum(o.court_count) filter (where o.source_kind='group_session'),0)
                           + coalesce(sum(o.court_count) filter (where o.source_kind<>'group_session'),0))::integer end,
         case when coalesce(bool_or(o.court_count is null),false) then 0
              else greatest(0,3-(coalesce(sum(o.court_count) filter (where o.source_kind='group_session'),0)
                           + coalesce(sum(o.court_count) filter (where o.source_kind<>'group_session'),0)))::integer end,
         not coalesce(bool_or(o.court_count is null),false)
  from generate_series(p_start_date::timestamp,p_end_date::timestamp,interval '1 day') as d(day)
  cross join lateral generate_series(d.day + time '08:00',d.day + time '21:30',interval '30 minutes') as slots(slot_start)
  left join public.shared_court_occupancy o
    on o.status in ('scheduled','pending','accepted','confirmed','completed')
   and (o.session_date + o.start_time) < slots.slot_start + interval '30 minutes'
   and (o.session_date + o.end_time) > slots.slot_start
   and o.session_date=d.day::date
  group by d.day,slots.slot_start
  order by d.day,slots.slot_start;
end;
$function$;

revoke all on function public.get_club_court_capacity(date,date) from public,anon;
grant execute on function public.get_club_court_capacity(date,date) to authenticated;

create or replace function private.request_private_booking(
  p_coach_id uuid,
  p_session_date date,
  p_start_time time without time zone,
  p_duration_minutes integer,
  p_court_number smallint default null
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
  v_max_occupied integer;
begin
  if v_player is null or not public.is_player() then
    raise exception 'Connexion joueur requise.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id=p_coach_id and role='coach' and archived_at is null
  ) then
    raise exception 'Coach invalide.';
  end if;
  if not exists (
    select 1 from public.coach_players cp
    where cp.coach_id=p_coach_id and cp.player_id=v_player
  ) then
    raise exception 'Tu dois être lié à ce coach pour réserver un cours.';
  end if;
  if p_duration_minutes not in (60,90,120) then
    raise exception 'Durée non autorisée.';
  end if;

  v_start := p_session_date + p_start_time;
  v_end := v_start + make_interval(mins=>p_duration_minutes);
  if v_start < (now() at time zone 'Europe/Paris') + interval '30 minutes' then
    raise exception 'La réservation doit être effectuée au moins 30 minutes avant le début du cours.';
  end if;
  if not exists (
    select 1 from public.coach_weekly_availability a
    where a.coach_id=p_coach_id
      and a.weekday=extract(isodow from p_session_date)::smallint
      and a.active=true
      and a.start_time<=p_start_time
      and a.end_time>=(p_start_time + make_interval(mins=>p_duration_minutes))
  ) then
    raise exception 'Ce créneau ne fait pas partie des disponibilités publiées par le coach.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('club-courts:'||p_session_date::text,0));

  if exists (
    select 1 from public.booking_requests b
    where b.coach_id=p_coach_id and b.session_date=p_session_date
      and b.status in ('pending','accepted')
      and (b.session_date+b.start_time)<v_end
      and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>v_start
  ) then
    raise exception 'Ce coach a déjà une demande ou une réservation sur ce créneau.';
  end if;
  if exists (
    select 1 from public.training_sessions s
    where s.created_by=p_coach_id and s.session_date=p_session_date
      and (s.session_date+coalesce(s.session_time,time '00:00'))<v_end
      and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60)))>v_start
      and lower(coalesce(s.status,'')) not in ('annulée','annulee','annule','annulé','cancelled','canceled')
  ) then
    raise exception 'Le coach a déjà une séance sur ce créneau.';
  end if;
  if exists (
    select 1 from public.group_sessions g
    where g.coach_id=p_coach_id and g.session_date=p_session_date
      and g.status not in ('cancelled','canceled','annulé','annulee')
      and (g.session_date+g.start_time)<v_end
      and (g.session_date+g.end_time)>v_start
  ) then
    raise exception 'Le coach est indisponible : un cours collectif est prévu sur ce créneau.';
  end if;

  v_max_occupied := private.max_club_court_occupancy(v_start,v_end,null,null,0::smallint);
  if v_max_occupied >= 3 then
    raise exception 'Les trois terrains sont déjà occupés sur une partie de ce créneau.';
  end if;

  insert into public.booking_requests
    (coach_id,player_id,session_date,start_time,duration_minutes,court_number,court_count,status)
  values
    (p_coach_id,v_player,p_session_date,p_start_time,p_duration_minutes,null,1,'pending')
  returning id into v_id;

  insert into public.coach_notifications
    (coach_id,player_id,notification_type,title,body,target_path)
  values
    (p_coach_id,v_player,'booking_request',
     'Nouvelle demande de cours',
     'Une demande de cours particulier attend ta réponse.',
     'bookings');

  return v_id;
end;
$function$;

create or replace function private.review_private_booking(
  p_request_id uuid,
  p_decision text,
  p_coach_note text default ''
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking public.booking_requests%rowtype;
  v_first_name text;
  v_when text;
  v_enabled boolean := true;
  v_start timestamp;
  v_end timestamp;
  v_max_occupied integer;
begin
  if auth.uid() is null or not public.is_coach() then
    raise exception 'Connexion coach requise.';
  end if;
  if p_decision not in ('accepted','rejected') then
    raise exception 'Décision invalide.';
  end if;
  select * into v_booking from public.booking_requests where id=p_request_id for update;
  if not found or v_booking.coach_id<>auth.uid() then
    raise exception 'Demande introuvable.';
  end if;
  if v_booking.status<>'pending' then
    raise exception 'Cette demande a déjà été traitée.';
  end if;

  if p_decision='accepted' then
    v_start:=v_booking.session_date+v_booking.start_time;
    v_end:=v_start+make_interval(mins=>v_booking.duration_minutes);
    if v_start < (now() at time zone 'Europe/Paris') + interval '30 minutes' then
      raise exception 'Impossible de confirmer un cours à moins de 30 minutes de son début.';
    end if;
    if not exists (
      select 1 from public.coach_players cp
      where cp.coach_id=v_booking.coach_id and cp.player_id=v_booking.player_id
    ) then
      raise exception 'Impossible de confirmer : le joueur n’est plus lié à ce coach.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('club-courts:'||v_booking.session_date::text,0));

    if exists (
      select 1 from public.booking_requests b
      where b.id<>v_booking.id and b.coach_id=v_booking.coach_id
        and b.session_date=v_booking.session_date and b.status in ('pending','accepted')
        and (b.session_date+b.start_time)<v_end
        and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>v_start
    ) then
      raise exception 'Conflit : le coach a déjà une autre demande ou réservation.';
    end if;
    if exists (
      select 1 from public.training_sessions s
      where s.created_by=v_booking.coach_id and s.session_date=v_booking.session_date
        and (s.session_date+coalesce(s.session_time,time '00:00'))<v_end
        and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60)))>v_start
        and lower(coalesce(s.status,'')) not in ('annulée','annulee','annule','annulé','cancelled','canceled')
    ) then
      raise exception 'Conflit : le coach a ajouté une séance sur ce créneau.';
    end if;
    if exists (
      select 1 from public.group_sessions g
      where g.coach_id=v_booking.coach_id and g.session_date=v_booking.session_date
        and g.status not in ('cancelled','canceled','annulé','annulee')
        and (g.session_date+g.start_time)<v_end
        and (g.session_date+g.end_time)>v_start
    ) then
      raise exception 'Conflit : un cours collectif occupe ce créneau.';
    end if;

    v_max_occupied:=private.max_club_court_occupancy(v_start,v_end,'booking',v_booking.id,0::smallint);
    if v_max_occupied >= 3 then
      raise exception 'Conflit : les trois terrains sont maintenant occupés sur une partie de ce créneau.';
    end if;
  end if;

  update public.booking_requests
  set status=p_decision,coach_note=coalesce(p_coach_note,''),reviewed_at=now()
  where id=p_request_id;

  select coalesce(nullif(trim(first_name),''),'') into v_first_name
  from public.profiles where id=v_booking.player_id;
  v_when:=pg_catalog.to_char(v_booking.session_date,'DD/MM/YYYY')
    || ' à ' || pg_catalog.to_char(v_booking.start_time,'HH24:MI');
  select coalesce(booking_decisions,true) into v_enabled
  from public.notification_preferences where user_id=v_booking.player_id;
  if not found then v_enabled:=true; end if;
  if v_enabled then
    insert into public.player_notifications
      (player_id,coach_id,notification_type,title,body,target_path,source_id)
    values (
      v_booking.player_id,v_booking.coach_id,'booking_decision',
      case when p_decision='accepted'
        then case when v_first_name<>'' then v_first_name||', ton cours est confirmé !' else 'Ton cours est confirmé !' end
        else case when v_first_name<>'' then v_first_name||', ta demande de cours a été refusée' else 'Demande de cours refusée' end
      end,
      case when p_decision='accepted'
        then 'Ton cours particulier est confirmé pour le '||v_when
          ||' · durée : '||v_booking.duration_minutes||' min.'
        else 'Ta demande de cours particulier du '||v_when||' n’a pas été acceptée.'
      end,
      'bookings',v_booking.id
    );
  end if;
end;
$function$;

-- Public RPC wrappers keep the existing app contract and deliberately ignore legacy court numbers.
create or replace function public.request_private_booking(
  p_coach_id uuid,p_session_date date,p_start_time time without time zone,
  p_duration_minutes integer,p_court_number smallint default null
)
returns uuid language sql security invoker set search_path to ''
as $function$
  select private.request_private_booking(p_coach_id,p_session_date,p_start_time,p_duration_minutes,p_court_number);
$function$;

create or replace function public.review_private_booking(
  p_request_id uuid,p_decision text,p_coach_note text default ''
)
returns void language sql security invoker set search_path to ''
as $function$
  select private.review_private_booking(p_request_id,p_decision,p_coach_note);
$function$;


-- Trigger and internal helpers are not callable as public RPC endpoints.
revoke all on function public.sync_group_shared_court_occupancy() from public, anon, authenticated;
revoke all on function public.sync_booking_shared_court_occupancy() from public, anon, authenticated;
revoke all on function public.sync_training_shared_court_occupancy() from public, anon, authenticated;
revoke all on function private.max_club_court_occupancy(timestamp without time zone,timestamp without time zone,text,uuid,smallint) from public, anon, authenticated;
revoke all on function private.guard_group_shared_court_capacity() from public, anon, authenticated;
revoke all on function private.guard_training_shared_court_capacity() from public, anon, authenticated;
