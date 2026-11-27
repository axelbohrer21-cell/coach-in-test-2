-- Align preview-only constraints and default privileges with production.
-- All changes are additive or privilege reductions; no rows are deleted or rewritten.

alter table public.group_course_series
  drop constraint if exists group_course_series_check1;
alter table public.group_course_series
  add constraint group_course_series_check1
  check (
    (audience = 'adultes' and weekday = any (array[1,2,3,4,5]))
    or
    (audience = 'enfants' and weekday = any (array[3,6]))
  );

alter table public.group_course_series
  drop constraint if exists group_course_series_court_number_check;
alter table public.group_course_series
  add constraint group_course_series_court_number_check
  check (court_number >= 1 and court_number <= 4);

alter table public.training_sessions
  drop constraint if exists training_sessions_duration_minutes_check;
alter table public.training_sessions
  add constraint training_sessions_duration_minutes_check
  check (duration_minutes >= 1 and duration_minutes <= 360);

revoke references, trigger, truncate on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
