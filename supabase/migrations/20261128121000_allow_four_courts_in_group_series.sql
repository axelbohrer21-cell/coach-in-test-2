-- Align the experimental group-series court_count constraint with the club's
-- actual four-court capacity. Production schemas without this column are skipped.

do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='group_course_series' and column_name='court_count'
  ) then
    alter table public.group_course_series
      drop constraint if exists group_course_series_court_count_check;
    alter table public.group_course_series
      add constraint group_course_series_court_count_check
      check ((court_count between 1 and 4) or court_count is null);
  end if;
end;
$migration$;
