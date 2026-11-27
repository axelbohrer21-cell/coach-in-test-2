-- When any overlapping collective has unknown capacity, expose a conservative
-- "unknown / fully blocked" aggregate of 3 courts rather than a misleading sum > 3.
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
    select coalesce(bool_or(pa.unknown),false) as unknown,
           case when coalesce(bool_or(pa.unknown),false) then 3
                else coalesce(sum(pa.occupied_courts),0)::integer end as occupied_courts,
           coalesce(bool_or(pa.shared_activity_id is not null and pa.coach_count>1 and pa.occupied_courts>=3),false) as shared_plateau
    from per_activity pa
  ) cap on true
  order by d.day,slots.slot_start;
end;
$function$;
