-- Add covering indexes for foreign keys identified by Supabase Performance Advisor.
-- Non-destructive; improves joins and cascade checks as Coach In grows.
create index if not exists idx_booking_requests_player_id on public.booking_requests(player_id);
create index if not exists idx_coach_notifications_player_id on public.coach_notifications(player_id);
create index if not exists idx_coach_player_invitations_inviter_coach_id on public.coach_player_invitations(inviter_coach_id);
create index if not exists idx_coach_player_messages_player_id on public.coach_player_messages(player_id);
create index if not exists idx_coach_player_messages_sender_id on public.coach_player_messages(sender_id);
create index if not exists idx_coach_session_notes_coach_id on public.coach_session_notes(coach_id);
create index if not exists idx_coach_unavailability_coach_id on public.coach_unavailability(coach_id);
create index if not exists idx_coach_video_analyses_player_id on public.coach_video_analyses(player_id);
create index if not exists idx_evaluations_created_by on public.evaluations(created_by);
create index if not exists idx_evaluations_session_id on public.evaluations(session_id);
create index if not exists idx_player_achievements_coach_id on public.player_achievements(coach_id);
create index if not exists idx_player_achievements_criterion_id on public.player_achievements(criterion_id);
create index if not exists idx_player_challenges_coach_id on public.player_challenges(coach_id);
create index if not exists idx_player_challenges_criterion_id on public.player_challenges(criterion_id);
create index if not exists idx_player_notifications_coach_id on public.player_notifications(coach_id);
create index if not exists idx_session_library_coach_id on public.session_library(coach_id);
create index if not exists idx_training_sessions_created_by on public.training_sessions(created_by);
