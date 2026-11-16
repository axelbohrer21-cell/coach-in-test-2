-- Les dimanches ne sont pas réservables pour les cours particuliers.
create or replace function public.is_private_lesson_date_allowed(p_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extract(isodow from p_date)::integer <> 7
    and not public.is_zone_b_school_holiday(p_date)
    and (
      p_date = date '2027-05-08'
      or p_date not in (
        date '2026-11-01', date '2026-11-11', date '2026-12-25',
        date '2027-01-01', date '2027-04-05', date '2027-05-01',
        date '2027-05-06', date '2027-05-17'
      )
    );
$$;
