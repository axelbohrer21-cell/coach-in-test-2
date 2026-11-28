-- Restrict player-visible coach unavailability to coaches linked to the caller.
-- The SECURITY DEFINER function must enforce the coach-player relationship itself;
-- callers must not be able to enumerate availability for unrelated coaches.

create or replace function private.get_player_coach_unavailability(p_coach_ids uuid[])
returns table(coach_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select u.coach_id, u.starts_at, u.ends_at
  from public.coach_unavailability u
  join public.profiles p
    on p.id = u.coach_id
  join public.coach_players cp
    on cp.coach_id = u.coach_id
   and cp.player_id = auth.uid()
  where u.coach_id = any(coalesce(p_coach_ids, array[]::uuid[]))
    and p.role = 'coach'
    and p.archived_at is null
    and u.starts_at is not null
    and u.ends_at is not null
    and u.ends_at > u.starts_at
    and public.is_player();
$function$;
