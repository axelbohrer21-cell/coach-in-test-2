-- Extend Supabase Realtime only to user-facing tables with RLS enabled.
-- This keeps coach/player updates live without broadening row access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','training_sessions','evaluations','evaluation_criteria',
    'player_challenges','player_achievements','player_profile_details',
    'booking_requests','group_sessions','group_course_series',
    'group_course_cancellations','coach_unavailability','club_events',
    'coach_video_analyses','coach_video_correction_followups',
    'coach_player_invitations'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

-- Trigger functions are invoked by PostgreSQL triggers, not exposed as RPC endpoints.
revoke all on function public.enqueue_coach_in_push() from public, anon, authenticated;

-- Keep the player-facing availability RPC present in both production and preview.
create or replace function public.get_player_coach_unavailability(p_coach_ids uuid[])
returns table(coach_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select u.coach_id, u.starts_at, u.ends_at
  from public.coach_unavailability u
  where u.coach_id = any(coalesce(p_coach_ids, array[]::uuid[]))
    and u.starts_at is not null
    and u.ends_at is not null
    and u.ends_at > u.starts_at
    and exists (
      select 1 from public.coach_players cp
      where cp.coach_id = u.coach_id
        and cp.player_id = (select auth.uid())
    );
$function$;
revoke all on function public.get_player_coach_unavailability(uuid[]) from public, anon;
grant execute on function public.get_player_coach_unavailability(uuid[]) to authenticated;

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);
