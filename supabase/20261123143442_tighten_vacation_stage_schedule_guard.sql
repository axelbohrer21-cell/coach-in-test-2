create or replace function public.guard_coach_in_schedule_dates()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_day integer;
  v_stage boolean := false;
  v_vacation_saturday boolean := false;
begin
  if tg_table_name in ('training_sessions', 'booking_requests') then
    if not public.is_private_lesson_date_allowed(new.session_date) then
      raise exception 'Les cours particuliers sont suspendus le dimanche, pendant les vacances scolaires et les jours fériés (sauf le 8 mai).';
    end if;
  elsif tg_table_name = 'group_sessions' then
    if new.session_date between date '2026-09-14' and date '2027-06-20' then
      v_day := extract(isodow from new.session_date)::integer;
      v_stage := new.audience = 'enfants'
        and new.theme = 'Stage enfants'
        and public.is_zone_b_school_holiday(new.session_date)
        and v_day between 1 and 5
        and new.start_time = time '09:30'
        and new.end_time = time '16:30'
        and new.court_number between 1 and 3;
      v_vacation_saturday := new.audience = 'enfants'
        and new.session_date in (date '2026-10-17',date '2026-12-19',date '2027-02-20',date '2027-04-17')
        and v_day = 6
        and new.start_time = time '09:30'
        and new.end_time = time '14:30'
        and new.court_number between 1 and 3;

      if new.session_date in (date '2026-11-02',date '2026-11-12') then
        raise exception 'Tous les cours collectifs sont annulés à cette date.';
      end if;
      if public.is_zone_b_school_holiday(new.session_date) and not (v_stage or v_vacation_saturday) then
        raise exception 'Aucun cours collectif hebdomadaire pendant les vacances scolaires Zone B.';
      end if;
      if new.audience = 'adultes' then
        if v_day not in (1,2,3,4,5) then
          raise exception 'Les cours collectifs adultes sont prévus du lundi au vendredi.';
        end if;
        if new.session_date in (
          date '2026-11-01', date '2026-11-11', date '2026-12-25',
          date '2027-01-01', date '2027-04-05', date '2027-05-01',
          date '2027-05-06', date '2027-05-08', date '2027-05-17'
        ) then
          raise exception 'Aucun cours collectif adulte les jours fériés.';
        end if;
      elsif new.audience = 'enfants' then
        if v_stage then
          if new.session_date in (date '2026-12-25',date '2027-01-01') then
            raise exception 'Aucun stage les jours fériés.';
          end if;
        elsif v_vacation_saturday then
          null;
        else
          if v_day not in (3,6) then
            raise exception 'Les cours collectifs enfants sont prévus les mercredis et samedis.';
          end if;
          if public.is_zone_b_school_holiday(new.session_date) then
            raise exception 'Les cours enfants hebdomadaires sont suspendus pendant les vacances.';
          end if;
          if new.end_time <= new.start_time
            or (v_day = 3 and (new.start_time < time '09:30' or new.end_time > time '18:00'))
            or (v_day = 6 and (new.start_time < time '09:30' or new.end_time > time '14:30')) then
            raise exception 'Les cours enfants doivent respecter les horaires du mercredi (9 h 30–18 h) ou du samedi (9 h 30–14 h 30).';
          end if;
        end if;
      else
        raise exception 'Public du cours collectif invalide.';
      end if;
    end if;
  end if;
  return new;
end;
$function$;