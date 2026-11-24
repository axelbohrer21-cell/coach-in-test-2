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

-- The player-facing availability RPC verifies auth.uid() against active coach links.
revoke all on function public.get_player_coach_unavailability(uuid[]) from public, anon;
grant execute on function public.get_player_coach_unavailability(uuid[]) to authenticated;

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);
