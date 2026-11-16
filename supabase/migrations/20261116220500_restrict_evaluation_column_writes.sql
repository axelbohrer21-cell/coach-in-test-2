revoke all on table public.evaluations from anon;
revoke insert, update, references, trigger, truncate on table public.evaluations from authenticated;
grant insert (player_id, session_id, evaluated_at, score, technical_score, tactical_score, physical_score, mental_score, player_visible_comment, created_by)
on table public.evaluations to authenticated;
grant update (player_id, session_id, evaluated_at, score, technical_score, tactical_score, physical_score, mental_score, player_visible_comment)
on table public.evaluations to authenticated;
