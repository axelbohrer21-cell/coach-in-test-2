-- Production migration: security_video_analysis_processing_fields
grant update (status,analysis_error,model_name,confidence,analyzed_at) on table public.coach_video_analyses to authenticated;
