-- Coach In · Agent Planning
-- Align suggestions with the persisted shared calendar used by Coach A and Coach B.
-- Recurring group sessions must be represented in shared_court_occupancy;
-- this function deliberately contains no coach-specific IDs or fallback timetable.

create or replace function public.get_private_booking_suggestions(
  p_coach_id uuid,
  p_session_date date,
  p_duration_minutes integer
)
returns table (
  coach_id uuid,
  session_date date,
  start_time time without time zone,
  end_time time without time zone,
  duration_minutes integer,
  court_number smallint
)
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_weekday smallint;
  v_school_holiday boolean;
  v_public_holiday boolean;
begin
  if v_user_id is null then
    raise exception 'Connexion requise.';
  end if;

  if p_coach_id is null or p_session_date is null then
    raise exception 'Coach et date obligatoires.';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;
  if v_role is null then
    raise exception 'Profil utilisateur introuvable.';
  end if;

  if p_duration_minutes not in (60, 90, 120) then
    raise exception 'Durée autorisée : 1 h, 1 h 30 ou 2 h.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_coach_id
      and p.role = 'coach'
      and p.archived_at is null
  ) then
    raise exception 'Coach invalide ou archivé.';
  end if;

  if v_role = 'coach' then
    if p_coach_id <> v_user_id then
      raise exception 'Un coach ne peut consulter que son propre planning.';
    end if;
  elsif v_role = 'player' then
    if not exists (
      select 1
      from public.coach_players cp
      where cp.coach_id = p_coach_id
        and cp.player_id = v_user_id
    ) then
      raise exception 'Ce coach ne suit pas ce joueur.';
    end if;
  else
    raise exception 'Accès réservé aux coachs et aux joueurs.';
  end if;

  v_weekday := extract(isodow from p_session_date)::smallint;

  -- Règles calendrier Zone B utilisées par Coach In.
  -- Les bornes sont inclusives, comme dans le calendrier de l'application.
  v_school_holiday := (
    p_session_date between date '2026-10-17' and date '2026-11-01'
    or p_session_date between date '2026-12-19' and date '2027-01-03'
    or p_session_date between date '2027-02-20' and date '2027-03-07'
    or p_session_date between date '2027-04-17' and date '2027-05-02'
  );
  v_public_holiday := p_session_date in (
    date '2026-11-01', date '2026-11-11', date '2026-12-25', date '2027-01-01',
    date '2027-04-05', date '2027-05-01', date '2027-05-06', date '2027-05-08',
    date '2027-05-17'
  );

  -- Pas de proposition le dimanche, pendant les vacances ou les jours fériés
  -- (sauf le 8 mai, règle déjà retenue dans Coach In).
  if v_weekday = 7
     or v_school_holiday
     or (v_public_holiday and p_session_date <> date '2027-05-08') then
    return;
  end if;

  return query
  with candidate_slots as (
    select
      p_coach_id as candidate_coach_id,
      p_session_date as candidate_date,
      make_time((slot.minute_of_day / 60)::integer, (slot.minute_of_day % 60)::integer, 0) as candidate_start,
      (
        make_time((slot.minute_of_day / 60)::integer, (slot.minute_of_day % 60)::integer, 0)
        + make_interval(mins => p_duration_minutes)
      )::time without time zone as candidate_end,
      p_duration_minutes as candidate_duration,
      courts.court_number::smallint as candidate_court
    from generate_series(8 * 60, 22 * 60 - p_duration_minutes, 30) as slot(minute_of_day)
    cross join generate_series(1, 4) as courts(court_number)
  ),
  candidate_intervals as (
    select
      c.*,
      c.candidate_date + c.candidate_start as starts_at_local,
      c.candidate_date + c.candidate_end as ends_at_local
    from candidate_slots c
  )
  select
    c.candidate_coach_id,
    c.candidate_date,
    c.candidate_start,
    c.candidate_end,
    c.candidate_duration,
    c.candidate_court
  from candidate_intervals c
  where
    c.starts_at_local >= timezone('Europe/Paris', now()) + interval '30 minutes'
    and exists (
      select 1
      from public.coach_weekly_availability a
      where a.coach_id = p_coach_id
        and a.weekday = v_weekday
        and a.active = true
        and a.start_time <= c.candidate_start
        and a.end_time >= c.candidate_end
        and (a.court_number is null or a.court_number = c.candidate_court)
    )
    and not exists (
      select 1
      from public.shared_court_occupancy o
      where o.coach_id = p_coach_id
        and o.session_date = p_session_date
        and o.start_time < c.candidate_end
        and o.end_time > c.candidate_start
        and coalesce(o.status, '') not in ('cancelled', 'canceled', 'rejected', 'annulé', 'annule')
    )
    and (
      v_role <> 'coach'
      or not exists (
        select 1
        from public.booking_requests b
        where b.coach_id = p_coach_id
          and b.session_date = p_session_date
          and b.court_number = c.candidate_court
          and b.status in ('pending', 'accepted')
          and b.start_time < c.candidate_end
          and (b.start_time + make_interval(mins => b.duration_minutes)) > c.candidate_start
      )
    )
    and (
      (
        v_role = 'coach'
        and not exists (
          select 1
          from public.coach_unavailability u
          where u.coach_id = p_coach_id
            and timezone('Europe/Paris', u.starts_at) < c.ends_at_local
            and timezone('Europe/Paris', u.ends_at) > c.starts_at_local
        )
      )
      or (
        v_role = 'player'
        and not exists (
          select 1
          from public.get_player_coach_unavailability(array[p_coach_id]) u
          where timezone('Europe/Paris', u.starts_at) < c.ends_at_local
            and timezone('Europe/Paris', u.ends_at) > c.starts_at_local
        )
      )
    )
  order by c.candidate_start, c.candidate_court;
end;
$function$;

revoke all on function public.get_private_booking_suggestions(uuid, date, integer) from public, anon;
grant execute on function public.get_private_booking_suggestions(uuid, date, integer) to authenticated;

comment on function public.get_private_booking_suggestions(uuid, date, integer)
is 'Lecture seule, SECURITY INVOKER : propose les créneaux selon les disponibilités et occupations partagées persistées, sans règle ni identifiant spécifique à un coach. Ne crée aucune réservation.';
