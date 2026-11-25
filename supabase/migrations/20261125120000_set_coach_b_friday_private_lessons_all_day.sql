-- Coach B is available for private lessons all day on Fridays (08:00-22:00).
do $$
declare
  v_coach_id uuid;
begin
  select id into v_coach_id
  from auth.users
  where lower(email) = 'coachb@gmail.com'
  limit 1;

  if v_coach_id is null then
    raise exception 'Coach B account not found';
  end if;

  delete from public.coach_weekly_availability
  where coach_id = v_coach_id
    and weekday = 5;

  insert into public.coach_weekly_availability
    (coach_id, weekday, start_time, end_time, court_number, active)
  values
    (v_coach_id, 5, '08:00', '22:00', null, true);
end $$;