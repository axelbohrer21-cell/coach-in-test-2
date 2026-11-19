-- Réduire les privilèges SQL au strict nécessaire ; RLS reste le contrôle d’accès ligne par ligne.
revoke all privileges on table public.coach_session_exercises from public, anon, authenticated;
grant select, insert, update, delete on table public.coach_session_exercises to authenticated;
