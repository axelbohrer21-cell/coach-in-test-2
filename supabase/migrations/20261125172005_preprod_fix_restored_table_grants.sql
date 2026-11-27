-- Replace inherited default table grants on newly restored application tables with explicit least-privilege grants.
revoke all on table public.coach_physical_programs from authenticated;
grant select, insert, update, delete on table public.coach_physical_programs to authenticated;

revoke all on table public.coach_session_favorites from authenticated;
grant select, insert, delete on table public.coach_session_favorites to authenticated;

revoke all on table public.player_coach_directory from authenticated;
grant select on table public.player_coach_directory to authenticated;
