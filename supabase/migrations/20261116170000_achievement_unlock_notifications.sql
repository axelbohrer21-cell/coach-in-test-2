-- Coach In — notification automatique lors du déblocage d'une réussite.
-- Le coach ne peut notifier que les réussites de son propre suivi.
begin;

create or replace function public.notify_player_achievement_unlocked(p_achievement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_criterion text;
begin
  if auth.uid() is null or not public.is_coach() then
    raise exception 'Action réservée à un coach.';
  end if;

  select a.player_id, a.criterion
    into v_player_id, v_criterion
  from public.player_achievements a
  join public.coach_players cp
    on cp.player_id = a.player_id
   and cp.coach_id = a.coach_id
  where a.id = p_achievement_id
    and a.coach_id = auth.uid();

  if v_player_id is null then
    raise exception 'Réussite introuvable ou non attribuée par ce coach.';
  end if;

  insert into public.player_notifications (
    player_id, notification_type, title, body, target_path
  )
  values (
    v_player_id,
    'achievement_unlocked',
    'Nouvelle réussite débloquée !',
    'Bravo ! Tu as validé la compétence « ' || v_criterion ||
      ' » dans au moins trois bilans distincts. Retrouve-la dans ton parcours.',
    'reports'
  );
end;
$$;

revoke all on function public.notify_player_achievement_unlocked(uuid) from public;
revoke all on function public.notify_player_achievement_unlocked(uuid) from anon;
grant execute on function public.notify_player_achievement_unlocked(uuid) to authenticated;

commit;