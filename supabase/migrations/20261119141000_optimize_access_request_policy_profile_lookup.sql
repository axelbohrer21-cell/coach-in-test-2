-- Use the authenticated profile row directly to avoid auth.jwt() policy re-evaluation.
drop policy if exists access_request_coach_select on public.player_access_requests;
create policy access_request_coach_select on public.player_access_requests
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role='coach'
      and p.archived_at is null
      and lower(p.email)=lower(player_access_requests.coach_email)
  )
);
