
create or replace function public.filter_coach_in_app_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_enabled boolean := true; v_user_id uuid; v_column text;
begin
  if tg_table_name = 'player_notifications' then v_user_id := new.player_id;
  else v_user_id := new.coach_id; end if;
  v_column := case new.notification_type
    when 'booking_request' then 'booking_requests'
    when 'booking_decision' then 'booking_decisions'
    when 'booking_cancelled' then 'booking_changes'
    when 'booking_reminder' then 'reminders_24h'
    when 'new_message' then 'messages'
    when 'challenge_created' then 'progress'
    when 'challenge_completed' then 'progress'
    when 'achievement_unlocked' then 'progress'
    when 'session_created' then 'session_changes'
    when 'session_updated' then 'session_changes'
    when 'session_cancelled' then 'session_changes'
    else null end;
  if v_column is not null then
    execute format('select coalesce(%I,true) from public.notification_preferences where user_id=$1',v_column)
      into v_enabled using v_user_id;
    v_enabled := coalesce(v_enabled,true);
  end if;
  if not coalesce(v_enabled,true) then return null; end if;
  return new;
end;
$$;
drop trigger if exists filter_player_in_app_notifications on public.player_notifications;
create trigger filter_player_in_app_notifications before insert on public.player_notifications
for each row execute function public.filter_coach_in_app_notification();
drop trigger if exists filter_coach_in_app_notifications on public.coach_notifications;
create trigger filter_coach_in_app_notifications before insert on public.coach_notifications
for each row execute function public.filter_coach_in_app_notification();

create or replace function public.notify_coach_in_progress_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_title text; v_body text; v_type text;
begin
  if tg_table_name = 'player_challenges' then
    if tg_op = 'INSERT' then
      v_type := 'challenge_created'; v_title := 'Nouveau défi à relever';
      v_body := 'Ton coach t’a proposé un défi : ' || new.criterion || '. ' || new.objective;
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'completed' then
      v_type := 'challenge_completed'; v_title := 'Défi réussi !';
      v_body := 'Bravo ! Tu as terminé le défi « ' || new.criterion || ' ».';
    else return new;
    end if;
  elsif tg_table_name = 'player_achievements' and tg_op = 'INSERT' then
    v_type := 'achievement_unlocked'; v_title := 'Nouvelle réussite débloquée !';
    v_body := 'Bravo ! Tu as validé la compétence « ' || new.criterion || ' » dans au moins trois bilans distincts. Retrouve-la dans ton parcours.';
  else return new;
  end if;
  insert into public.player_notifications(player_id,coach_id,notification_type,title,body,target_path)
  values(new.player_id,new.coach_id,v_type,v_title,v_body,'reports');
  return new;
end;
$$;
