-- Production migration: security_hardening_client_table_privileges
begin;
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;
revoke update on table public.booking_requests from authenticated;
drop policy if exists booking_coach_update on public.booking_requests;
revoke update on table public.profiles from authenticated;
grant update (first_name,last_name,email,birth_date,fft_ranking,age_category,player_type,avatar_url,player_color) on table public.profiles to authenticated;
revoke update on table public.coach_video_analyses from authenticated;
grant update (analysis_result,shared_with_player,coach_review,updated_at) on table public.coach_video_analyses to authenticated;
commit;
