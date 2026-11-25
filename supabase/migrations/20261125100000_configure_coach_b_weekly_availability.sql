-- Configure Coach B's recurring weekly availability using the same calendar system as Coach A.
do $$
declare
  v_coach_id uuid;
begin
  select id into v_coach_id
  from public.profiles
  where lower(email)='coachb@gmail.com' and role='coach' and archived_at is null;

  if v_coach_id is null then
    raise exception 'Coach B (coachb@gmail.com) introuvable ou inactif.';
  end if;

  delete from public.coach_weekly_availability
  where coach_id=v_coach_id;

  insert into public.coach_weekly_availability
    (coach_id,weekday,start_time,end_time,court_number,active)
  values
    (v_coach_id,1,'18:00','21:00',null,true),
    (v_coach_id,2,'12:15','13:45',null,true),
    (v_coach_id,2,'17:30','20:30',null,true),
    (v_coach_id,3,'09:30','19:30',null,true),
    (v_coach_id,4,'18:00','19:30',null,true),
    (v_coach_id,6,'09:30','13:30',null,true);
end $$;