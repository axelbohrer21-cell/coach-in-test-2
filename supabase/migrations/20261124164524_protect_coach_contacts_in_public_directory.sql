-- Keep coach contact details private while exposing a minimal public directory.
drop policy if exists profiles_select_self_or_linked_player on public.profiles;
create policy profiles_select_self_or_linked_player
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (
    role = 'player' and archived_at is null
    and exists (select 1 from public.coach_players cp
      where cp.coach_id = (select auth.uid()) and cp.player_id = profiles.id)
  )
  or (
    role = 'coach' and (
      exists (select 1 from public.coach_players cp
        where cp.player_id = (select auth.uid()) and cp.coach_id = profiles.id)
      or exists (select 1 from public.training_sessions s
        where s.player_id = (select auth.uid()) and s.created_by = profiles.id)
      or exists (select 1 from public.evaluations e
        where e.player_id = (select auth.uid()) and e.created_by = profiles.id)
    )
  )
);

create or replace view public.player_coach_directory
with (security_barrier = true)
as
select id, first_name, last_name
from public.profiles
where role = 'coach' and archived_at is null;

revoke all on public.player_coach_directory from public, anon;
grant select on public.player_coach_directory to authenticated;
