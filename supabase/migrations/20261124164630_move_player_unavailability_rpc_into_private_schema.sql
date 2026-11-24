create or replace function private.get_player_coach_unavailability(p_coach_ids uuid[])
returns table(coach_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select u.coach_id, u.starts_at, u.ends_at
  from public.coach_unavailability u
  join public.profiles p on p.id = u.coach_id
  where u.coach_id = any(coalesce(p_coach_ids, array[]::uuid[]))
    and p.role = 'coach' and p.archived_at is null
    and u.starts_at is not null and u.ends_at is not null
    and u.ends_at > u.starts_at
    and public.is_player();
$function$;
revoke all on function private.get_player_coach_unavailability(uuid[]) from public, anon;
grant execute on function private.get_player_coach_unavailability(uuid[]) to authenticated;

create or replace function public.get_player_coach_unavailability(p_coach_ids uuid[])
returns table(coach_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security invoker
set search_path to ''
as $function$
  select * from private.get_player_coach_unavailability(p_coach_ids);
$function$;
revoke all on function public.get_player_coach_unavailability(uuid[]) from public, anon;
grant execute on function public.get_player_coach_unavailability(uuid[]) to authenticated;
