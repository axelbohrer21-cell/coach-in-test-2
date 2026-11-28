-- Group courses reserve a count of courts, never a specific court number.
create or replace function private.guard_group_shared_court_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start timestamp;
  v_end timestamp;
  v_max integer;
begin
  new.court_number := null;

  if new.status in ('scheduled','completed') then
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
$function$;

create or replace function public.sync_group_shared_court_occupancy()
returns trigger
language plpgsql
security definer
set search_path = ''
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
      (new.coach_id,new.session_date,new.start_time,new.end_time,null,
       new.court_count,new.shared_activity_id,new.audience,'group_session',new.id,
       case when new.status='completed' then 'completed' else 'scheduled' end)
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=null,court_count=excluded.court_count,
      shared_activity_id=excluded.shared_activity_id,
      audience=excluded.audience,status=excluded.status;
  else
    delete from public.shared_court_occupancy
    where source_kind='group_session' and source_id=new.id;
  end if;
  return new;
end;
$function$;

create or replace function private.clear_group_course_court_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.court_number := null;
  return new;
end;
$function$;

drop trigger if exists group_course_series_no_court_assignment on public.group_course_series;
create trigger group_course_series_no_court_assignment
before insert or update on public.group_course_series
for each row execute function private.clear_group_course_court_assignment();