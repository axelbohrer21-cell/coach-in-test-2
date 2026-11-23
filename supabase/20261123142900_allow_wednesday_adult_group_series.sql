alter table public.group_course_series drop constraint if exists group_course_series_check1;
alter table public.group_course_series
  add constraint group_course_series_check1
  check (
    (audience = 'adultes' and weekday = any (array[1,2,3,4,5]))
    or (audience = 'enfants' and weekday = any (array[3,6]))
  );