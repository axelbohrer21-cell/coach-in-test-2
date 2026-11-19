-- Final query-plan cleanup for Coach In RLS policies and remaining FK indexes.
create index if not exists idx_coach_players_player_id on public.coach_players(player_id);
create index if not exists idx_video_followups_evaluation_id on public.coach_video_correction_followups(evaluation_id);
create index if not exists idx_video_followups_player_id on public.coach_video_correction_followups(player_id);
create index if not exists idx_video_followups_session_id on public.coach_video_correction_followups(session_id);
create index if not exists idx_evaluations_player_id on public.evaluations(player_id);
create index if not exists idx_training_sessions_player_id on public.training_sessions(player_id);

drop policy if exists access_request_coach_select on public.player_access_requests;
create policy access_request_coach_select on public.player_access_requests
for select to authenticated
using ((select private.is_coach()) and lower(coach_email)=lower((select auth.jwt()->>'email')));

drop policy if exists coach_video_analyses_delete on public.coach_video_analyses;
create policy coach_video_analyses_delete on public.coach_video_analyses
for delete to authenticated
using (coach_id=(select auth.uid()) and (select private.is_coach()));

drop policy if exists coach_video_analyses_insert on public.coach_video_analyses;
create policy coach_video_analyses_insert on public.coach_video_analyses
for insert to authenticated
with check (
 coach_id=(select auth.uid()) and (select private.is_coach())
 and status='uploaded' and shared_with_player=false
 and exists (select 1 from public.coach_players cp
   join public.profiles p on p.id=cp.player_id and p.role='player' and p.archived_at is null
   where cp.coach_id=(select auth.uid()) and cp.player_id=coach_video_analyses.player_id)
);

drop policy if exists coach_video_analyses_update on public.coach_video_analyses;
create policy coach_video_analyses_update on public.coach_video_analyses
for update to authenticated
using (coach_id=(select auth.uid()) and (select private.is_coach()))
with check (
 coach_id=(select auth.uid()) and (select private.is_coach())
 and exists (select 1 from public.coach_players cp
   where cp.coach_id=(select auth.uid()) and cp.player_id=coach_video_analyses.player_id)
);
