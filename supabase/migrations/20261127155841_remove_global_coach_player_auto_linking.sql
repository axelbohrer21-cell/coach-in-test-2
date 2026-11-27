-- Reconcile the production migration history: remove the global auto-link trigger.
-- Existing explicit coach/player links are intentionally preserved.
drop trigger if exists trg_sync_global_coach_player_links on public.profiles;
drop function if exists private.sync_global_coach_player_links();
