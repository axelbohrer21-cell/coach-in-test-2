create or replace function private.get_coach_player_invitation_inbox()
returns table (
 id uuid, player_id uuid, inviter_coach_id uuid, status text, created_at timestamptz,
 player_first_name text, player_last_name text, inviter_first_name text, inviter_last_name text
)
language sql stable security definer set search_path=''
as $$
 select i.id,i.player_id,i.inviter_coach_id,i.status,i.created_at,
        p.first_name,c.first_name,p.last_name,c.last_name
 from public.coach_player_invitations i
 join public.profiles p on p.id=i.player_id
 join public.profiles c on c.id=i.inviter_coach_id
 where i.invited_coach_id=(select auth.uid())
   and i.status='pending'
   and exists(select 1 from public.profiles me
     where me.id=(select auth.uid()) and me.role='coach' and me.archived_at is null);
$$;
revoke all on function private.get_coach_player_invitation_inbox() from public,anon;
grant execute on function private.get_coach_player_invitation_inbox() to authenticated;

drop policy if exists profiles_select_invitation_context on public.profiles;
drop view if exists public.coach_player_invitation_inbox;
create view public.coach_player_invitation_inbox
with (security_invoker=true,security_barrier=true) as
select * from private.get_coach_player_invitation_inbox();
grant select on public.coach_player_invitation_inbox to authenticated;
revoke all on public.coach_player_invitation_inbox from public,anon;