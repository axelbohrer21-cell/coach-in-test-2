-- Coach In : appliquer les règles de calendrier côté base de données.
create or replace function public.is_zone_b_school_holiday(p_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1 from (values
      (date '2026-10-17', date '2026-11-02'),
      (date '2026-12-19', date '2027-01-04'),
      (date '2027-02-20', date '2027-03-08'),
      (date '2027-04-17', date '2027-05-03')
    ) as holidays(starts_on, ends_on)
    where p_date between starts_on and ends_on
  );
$$;

create or replace function public.is_private_lesson_date_allowed(p_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not public.is_zone_b_school_holiday(p_date)
    and (
      p_date = date '2027-05-08'
      or p_date not in (
        date '2026-11-01', date '2026-11-11', date '2026-12-25',
        date '2027-01-01', date '2027-04-05', date '2027-05-01',
        date '2027-05-06', date '2027-05-17'
      )
    );
$$;

create or replace function public.guard_coach_in_schedule_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_day integer;
begin
  if tg_table_name in ('training_sessions', 'booking_requests') then
    if not public.is_private_lesson_date_allowed(new.session_date) then
      raise exception 'Les cours particuliers sont suspendus pendant les vacances scolaires et les jours fériés (sauf le 8 mai).';
    end if;
  elsif tg_table_name = 'group_sessions' then
    if new.session_date between date '2026-09-14' and date '2027-06-20' then
      if public.is_zone_b_school_holiday(new.session_date) then
        raise exception 'Aucun cours collectif pendant les vacances scolaires Zone B.';
      end if;
      v_day := extract(isodow from new.session_date)::integer;
      if new.audience = 'adultes' then
        if v_day not in (1,2,4,5) then
          raise exception 'Les cours collectifs adultes sont prévus les lundis, mardis, jeudis et vendredis.';
        end if;
        if new.session_date in (
          date '2026-11-01', date '2026-11-11', date '2026-12-25',
          date '2027-01-01', date '2027-04-05', date '2027-05-01',
          date '2027-05-06', date '2027-05-17'
        ) then
          raise exception 'Aucun cours collectif adulte les jours fériés.';
        end if;
      elsif new.audience = 'enfants' then
        if v_day not in (3,6) then
          raise exception 'Les cours collectifs enfants sont prévus les mercredis et samedis.';
        end if;
      else
        raise exception 'Public du cours collectif invalide.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_training_session_dates on public.training_sessions;
create trigger guard_training_session_dates
before insert or update of session_date on public.training_sessions
for each row execute function public.guard_coach_in_schedule_dates();

drop trigger if exists guard_booking_request_dates on public.booking_requests;
create trigger guard_booking_request_dates
before insert or update of session_date, status on public.booking_requests
for each row execute function public.guard_coach_in_schedule_dates();

drop trigger if exists guard_group_session_dates on public.group_sessions;
create trigger guard_group_session_dates
before insert or update of session_date, audience, status on public.group_sessions
for each row execute function public.guard_coach_in_schedule_dates();
