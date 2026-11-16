
revoke select (id,player_id,session_id,evaluated_at,score,technical_score,tactical_score,physical_score,mental_score,player_visible_comment,coach_private_notes,created_by,created_at)
on public.evaluations from anon;
