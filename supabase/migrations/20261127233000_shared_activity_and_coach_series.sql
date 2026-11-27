-- Coach-specific group schedules, annual series backfill, and deduplicated co-coaching capacity.
-- This migration is additive and idempotent. It is first applied to the TEST project only.

alter table public.group_course_series
  alter column court_count drop not null,
  alter column court_count drop default;

alter table public.group_sessions
  add column if not exists shared_activity_id uuid;

alter table public.group_course_series
  add column if not exists shared_activity_id uuid;

alter table public.shared_court_occupancy
  add column if not exists shared_activity_id uuid;

alter table public.group_course_series
  drop constraint if exists group_course_series_court_count_check;
alter table public.group_course_series
  add constraint group_course_series_court_count_check
  check (court_count between 1 and 3 or court_count is null);

comment on column public.group_sessions.shared_activity_id is
  'Shared UUID for one collective activity co-animated by multiple coaches; each coach keeps its own session row.';
comment on column public.group_course_series.shared_activity_id is
  'Shared UUID for one annual collective activity co-animated by multiple coaches; each coach keeps its own series and counter.';
comment on column public.shared_court_occupancy.shared_activity_id is
  'Copied from group_sessions; used to count one co-animated activity once across coach rows.';

-- Backfill Coach B's eight annual blocks as separate coach-owned series, without inventing unknown court counts.
with coach as (
  select id from public.profiles where lower(email)='coachb@gmail.com' and role='coach' and archived_at is null
), desired(title,audience,weekday,start_time,end_time,target_sessions,court_count) as (
  values
    ('Cours collectifs adultes · Lundi','adultes',1,time '18:00',time '21:00',28,null::smallint),
    ('Cours collectifs adultes · Mardi midi','adultes',2,time '12:15',time '13:45',28,null::smallint),
    ('Cours collectifs adultes · Mardi 17 h 30','adultes',2,time '17:30',time '19:00',28,null::smallint),
    ('Cours collectifs adultes · Mardi 19 h','adultes',2,time '19:00',time '20:30',28,3::smallint),
    ('Cours collectifs enfants · Mercredi','enfants',3,time '09:30',time '18:00',30,null::smallint),
    ('Cours collectifs adultes · Mercredi','adultes',3,time '18:00',time '19:30',28,null::smallint),
    ('Cours collectifs adultes · Jeudi','adultes',4,time '18:00',time '19:30',28,null::smallint),
    ('Cours collectifs enfants · Samedi','enfants',6,time '09:30',time '13:30',30,null::smallint)
)
insert into public.group_course_series
  (coach_id,title,audience,weekday,start_time,end_time,court_number,court_count,target_sessions,theme,season_start,season_end,active)
select c.id,d.title,d.audience,d.weekday,d.start_time,d.end_time,null,d.court_count,d.target_sessions,'',
       date '2026-09-14',date '2027-06-20',true
from coach c cross join desired d
where not exists (
  select 1 from public.group_course_series s
  where s.coach_id=c.id and s.audience=d.audience and s.weekday=d.weekday
    and s.start_time=d.start_time and s.end_time=d.end_time
);

-- Link Coach B's already-created occurrences to their matching annual series.
-- No dates are generated, deleted, or moved by this backfill.
update public.group_sessions g
set series_id=s.id,
    shared_activity_id=s.shared_activity_id
from public.group_course_series s
join public.profiles p on p.id=s.coach_id
where lower(p.email)='coachb@gmail.com'
  and g.coach_id=s.coach_id
  and g.series_id is null
  and g.audience=s.audience
  and extract(isodow from g.session_date)::integer=s.weekday
  and g.start_time=s.start_time
  and g.end_time=s.end_time;

-- Keep the denormalized occupancy ledger synchronized with the shared activity identity.
update public.shared_court_occupancy o
set shared_activity_id=g.shared_activity_id
from public.group_sessions g
where o.source_kind='group_session' and o.source_id=g.id
  and o.shared_activity_id is distinct from g.shared_activity_id;

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
      (coach_id,session_date,start_time,end_time,court_number,court_count,shared_activity_id,audience,source_kind,source_id,status)
    values
      (new.coach_id,new.session_date,new.start_time,new.end_time,new.court_number,
       new.court_count,new.shared_activity_id,new.audience,'group_session',new.id,
       case when new.status='completed' then 'completed' else 'scheduled' end)
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=excluded.court_number,court_count=excluded.court_count,
      shared_activity_id=excluded.shared_activity_id,
      audience=excluded.audience,status=excluded.status;
  else
    delete from public.shared_court_occupancy
    where source_kind='group_session' and source_id=new.id;
  end if;
  return new;
end;
$function$;

-- Calculate the actual peak occupancy. Rows belonging to one shared activity are
-- summed per coach (e.g. Coach A's three one-court rows), then deduplicated across coaches.
drop function if exists private.max_club_court_occupancy(timestamp without time zone,timestamp without time zone,text,uuid,smallint,uuid,uuid);
create function private.max_club_court_occupancy(
  p_start timestamp without time zone,
  p_end timestamp without time zone,
  p_exclude_source_kind text,
  p_exclude_source_id uuid,
  p_add_group_count smallint,
  p_add_shared_activity_id uuid,
  p_add_coach_id uuid
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
  with points as (
    select p_start as at_time
    union
    select (o.session_date+o.start_time)::timestamp
    from public.shared_court_occupancy o
    where o.status in ('scheduled','pending','accepted','confirmed','completed')
      and (p_exclude_source_kind is null or p_exclude_source_id is null or not (o.source_kind=p_exclude_source_kind and o.source_id=p_exclude_source_id))
      and (o.session_date+o.start_time)<p_end and (o.session_date+o.end_time)>p_start
    union
    select (o.session_date+o.end_time)::timestamp
    from public.shared_court_occupancy o
    where o.status in ('scheduled','pending','accepted','confirmed','completed')
      and (p_exclude_source_kind is null or p_exclude_source_id is null or not (o.source_kind=p_exclude_source_kind and o.source_id=p_exclude_source_id))
      and (o.session_date+o.start_time)<p_end and (o.session_date+o.end_time)>p_start
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
               case when bool_or(unknown) then 3
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
$function$;

-- Keep the existing five-argument internal contract for private booking functions.
create or replace function private.max_club_court_occupancy(
  p_start timestamp without time zone,
  p_end timestamp without time zone,
  p_exclude_source_kind text,
  p_exclude_source_id uuid,
  p_add_group_count smallint
)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select private.max_club_court_occupancy(
    p_start,p_end,p_exclude_source_kind,p_exclude_source_id,p_add_group_count,null,null
  );
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

-- The public capacity RPC returns aggregate occupancy only; it never exposes coach-specific rows.
create or replace function private.get_club_court_capacity(p_start_date date,p_end_date date)
returns table(session_date date,slot_start time without time zone,occupied_courts integer,available_courts integer,capacity_known boolean,shared_plateau boolean)
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
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date
     or p_end_date>p_start_date+366 then
    raise exception 'Période de consultation invalide.';
  end if;

  return query
  select d.day::date,slots.slot_start::time,
         coalesce(cap.occupied_courts,0)::integer,
         greatest(0,3-coalesce(cap.occupied_courts,0))::integer,
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
             case when bool_or(unknown) then 3
                  when shared_activity_id is not null then max(coach_courts)
                  else sum(coach_courts) end as occupied_courts,
             count(distinct coach_id) as coach_count
      from per_coach
      group by activity_key,shared_activity_id
    )
    select coalesce(bool_or(unknown),false) as unknown,
           coalesce(sum(occupied_courts),0)::integer as occupied_courts,
           coalesce(bool_or(shared_activity_id is not null and coach_count>1 and occupied_courts>=3),false) as shared_plateau
    from per_activity
  ) cap on true
  order by d.day,slots.slot_start;
end;
$function$;

revoke all on function private.max_club_court_occupancy(timestamp without time zone,timestamp without time zone,text,uuid,smallint) from public,anon,authenticated;
revoke all on function private.max_club_court_occupancy(timestamp without time zone,timestamp without time zone,text,uuid,smallint,uuid,uuid) from public,anon,authenticated;
revoke all on function private.guard_group_shared_court_capacity() from public,anon,authenticated;
