-- Respecter les horaires fixes des cours collectifs enfants.
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
      raise exception 'Les cours particuliers sont suspendus le dimanche, pendant les vacances scolaires et les jours fériés (sauf le 8 mai).';
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
        if new.end_time <= new.start_time
          or (v_day = 3 and (new.start_time < time '09:30' or new.end_time > time '18:00'))
          or (v_day = 6 and (new.start_time < time '09:30' or new.end_time > time '14:30')) then
          raise exception 'Les cours enfants doivent respecter les horaires du mercredi (9 h 30–18 h) ou du samedi (9 h 30–14 h 30).';
        end if;
      else
        raise exception 'Public du cours collectif invalide.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
