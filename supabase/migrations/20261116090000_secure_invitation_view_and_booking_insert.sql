-- Keep invitation inbox subject to the caller's RLS policies.
-- The view is narrowly scoped to pending invitations addressed to auth.uid().
alter view public.coach_player_invitation_inbox set (security_invoker = true);

-- Permit the invited coach to read only the two profile rows needed by that inbox.
drop policy if exists profiles_select_invitation_context on public.profiles;
create policy profiles_select_invitation_context
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.coach_player_invitations i
    where i.invited_coach_id = (select auth.uid())
      and i.status = 'pending'
      and (i.player_id = profiles.id or i.inviter_coach_id = profiles.id)
  )
);

-- Player booking requests are created through the validated atomic RPC.
-- Remove the redundant direct-insert policy (its previous coach self-comparison was tautological).
drop policy if exists booking_player_insert on public.booking_requests;
