
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
    execute format('select %I from public.notification_preferences where user_id=$1',v_column)
      into v_enabled using v_user_id;
    v_enabled := coalesce(v_enabled,true);
  end if;
  if not coalesce(v_enabled,true) then return null; end if;
  return new;
end;
$$;
