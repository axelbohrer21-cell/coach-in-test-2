-- Coach In — durcissement des droits d'exécution des notifications.
-- Le déclenchement d'une notification de nouveau bilan est réservé aux utilisateurs authentifiés.
begin;
revoke all on function public.notify_player_new_evaluation(uuid) from public;
revoke all on function public.notify_player_new_evaluation(uuid) from anon;
grant execute on function public.notify_player_new_evaluation(uuid) to authenticated;
commit;
