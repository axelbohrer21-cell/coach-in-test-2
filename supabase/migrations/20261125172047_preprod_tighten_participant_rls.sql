-- Tighten two preview-only RLS paths and keep the current booking UI working through RPCs.
drop policy if exists coach_players_select_participant on public.coach_players;

drop policy if exists booking_coach_update on public.booking_requests;
revoke update on public.booking_requests from authenticated;

drop policy if exists profiles_select_self_or_linked_player on public.profiles;
create policy profiles_select_self_or_linked_player
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (
    role = 'player'
    and archived_at is null
    and (
      exists (
        select 1 from public.coach_players cp
        where cp.coach_id = (select auth.uid())
          and cp.player_id = profiles.id
      )
      or exists (
        select 1 from public.booking_requests b
        where b.coach_id = (select auth.uid())
          and b.player_id = profiles.id
          and b.status = 'pending'
      )
    )
  )
  or (
    role = 'coach'
    and (
      exists (
        select 1 from public.coach_players cp
        where cp.player_id = (select auth.uid())
          and cp.coach_id = profiles.id
      )
      or exists (
        select 1 from public.training_sessions s
        where s.player_id = (select auth.uid())
          and s.created_by = profiles.id
      )
      or exists (
        select 1 from public.evaluations e
        where e.player_id = (select auth.uid())
          and e.created_by = profiles.id
      )
    )
  )
);
