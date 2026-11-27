-- Restrict occupancy checkpoints to the requested interval.
-- Without the lower bound, a row that starts before p_start can incorrectly inflate
-- the maximum for a later interval (e.g. Coach B's 17:30–19:00 block at 19:00).

create or replace function private.max_club_court_occupancy(
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
      and (o.session_date+o.start_time)>=p_start
      and (o.session_date+o.start_time)<p_end
      and (o.session_date+o.end_time)>p_start
    union
    select (o.session_date+o.end_time)::timestamp
    from public.shared_court_occupancy o
    where o.status in ('scheduled','pending','accepted','confirmed','completed')
      and (p_exclude_source_kind is null or p_exclude_source_id is null or not (o.source_kind=p_exclude_source_kind and o.source_id=p_exclude_source_id))
      and (o.session_date+o.start_time)<p_end
      and (o.session_date+o.end_time)>p_start
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

revoke all on function private.max_club_court_occupancy(timestamp without time zone,timestamp without time zone,text,uuid,smallint,uuid,uuid) from public,anon,authenticated;
