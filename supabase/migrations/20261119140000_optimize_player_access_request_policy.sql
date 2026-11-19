-- Avoid per-row auth context evaluation in the coach access-request read policy.
-- Equivalent to private.is_coach(): the signed-in profile must be an active coach.
drop policy if exists access_request_coach_select on public.player_access_requests;
create policy access_request_coach_select on public.player_access_requests
for select to authenticated
using (
  lower(coach_email)=lower((select auth.jwt()->>'email'))
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role='coach'
      and p.archived_at is null
  )
);
