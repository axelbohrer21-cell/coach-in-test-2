-- Give new group series and sessions one court by default, matching the
-- existing UI's single court selector. Legacy rows with unknown allocations
-- remain NULL and are counted conservatively as all four courts.

do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='group_course_series' and column_name='court_count'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='group_sessions' and column_name='court_count'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='shared_court_occupancy' and column_name='court_count'
  ) then
    alter table public.group_course_series alter column court_count set default 1;
    alter table public.group_sessions alter column court_count set default 1;

    execute $sql$
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
    if new.court_count is null and new.court_number is not null then new.court_count := 1; end if;
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
;
$sql$;

    execute $sql$
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
        where p_add_group_count is null or p_add_group_count>0
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
;
$sql$;
  end if;
end;
$migration$;
