
alter table public.notification_preferences
  add column if not exists messages boolean not null default true,
  add column if not exists progress boolean not null default true,
  add column if not exists session_changes boolean not null default true;

alter table public.player_notifications
  add column if not exists coach_id uuid references public.profiles(id) on delete set null;

alter table public.coach_player_messages
  add column if not exists read_at timestamptz;

create or replace function public.notify_coach_in_message_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_enabled boolean := true;
begin
  if new.sender_id = new.coach_id then
    select coalesce(np.messages,true) into v_enabled from public.notification_preferences np where np.user_id=new.player_id;
    if not found then v_enabled := true; end if;
    if v_enabled then
      insert into public.player_notifications(player_id,coach_id,notification_type,title,body,target_path)
      values(new.player_id,new.coach_id,'new_message','Nouveau message de ton coach','Tu as reçu un nouveau message dans ta conversation avec ton coach.','messages');
    end if;
  else
    select coalesce(np.messages,true) into v_enabled from public.notification_preferences np where np.user_id=new.coach_id;
    if not found then v_enabled := true; end if;
    if v_enabled then
      insert into public.coach_notifications(coach_id,player_id,notification_type,title,body,target_path)
      values(new.coach_id,new.player_id,'new_message','Nouveau message joueur','Un joueur t’a envoyé un message. Ouvre la conversation pour lui répondre.','messages');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists coach_in_message_notification on public.coach_player_messages;
create trigger coach_in_message_notification after insert on public.coach_player_messages
for each row execute function public.notify_coach_in_message_event();

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

drop trigger if exists coach_in_challenge_notification on public.player_challenges;
create trigger coach_in_challenge_notification after insert or update of status on public.player_challenges
for each row execute function public.notify_coach_in_progress_event();

drop trigger if exists coach_in_achievement_notification on public.player_achievements;
create trigger coach_in_achievement_notification after insert on public.player_achievements
for each row execute function public.notify_coach_in_progress_event();

create or replace function public.notify_coach_in_session_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_enabled boolean := true; v_title text; v_body text; v_coach_id uuid; v_player_id uuid;
begin
  if tg_op = 'DELETE' then
    v_coach_id := old.created_by; v_player_id := old.player_id;
    v_title := 'Séance annulée';
    v_body := 'Ton coach a annulé la séance prévue le ' || to_char(old.session_date,'DD/MM/YYYY') || '.';
  elsif tg_op = 'INSERT' then
    v_coach_id := new.created_by; v_player_id := new.player_id;
    v_title := 'Nouvelle séance programmée';
    v_body := 'Une séance est programmée le ' || to_char(new.session_date,'DD/MM/YYYY') || ' à ' || coalesce(to_char(new.session_time,'HH24:MI'),'heure à confirmer') || ' : ' || new.theme || '.';
  elsif tg_op = 'UPDATE' and (
    old.session_date is distinct from new.session_date or old.session_time is distinct from new.session_time or
    old.duration_minutes is distinct from new.duration_minutes or old.theme is distinct from new.theme or
    old.status is distinct from new.status or old.court_number is distinct from new.court_number
  ) then
    v_coach_id := new.created_by; v_player_id := new.player_id;
    v_title := case when new.status is distinct from old.status and lower(new.status) in ('annulée','annulee','cancelled','canceled') then 'Séance annulée' else 'Séance modifiée' end;
    v_body := 'Les informations de ta séance du ' || to_char(new.session_date,'DD/MM/YYYY') || ' ont été modifiées. Consulte ton espace pour voir les détails.';
  else return new;
  end if;
  select coalesce(np.session_changes,true) into v_enabled from public.notification_preferences np where np.user_id=v_player_id;
  if not found then v_enabled := true; end if;
  if v_enabled and v_coach_id is not null then
    insert into public.player_notifications(player_id,coach_id,notification_type,title,body,target_path)
    values(v_player_id,v_coach_id,case when v_title='Nouvelle séance programmée' then 'session_created' when v_title='Séance annulée' then 'session_cancelled' else 'session_updated' end,v_title,v_body,'sessions');
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists coach_in_session_notification on public.training_sessions;
create trigger coach_in_session_notification after insert or update or delete on public.training_sessions
for each row execute function public.notify_coach_in_session_event();

create or replace function public.mark_coach_in_message_read(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_message public.coach_player_messages%rowtype;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select * into v_message from public.coach_player_messages where id=p_message_id for update;
  if not found then raise exception 'Message introuvable.'; end if;
  if auth.uid() = v_message.sender_id then raise exception 'Seul le destinataire peut marquer ce message comme lu.'; end if;
  if auth.uid() not in (v_message.coach_id,v_message.player_id) then raise exception 'Accès refusé.'; end if;
  update public.coach_player_messages set read_at=coalesce(read_at,now()) where id=p_message_id;
end;
$$;
grant execute on function public.mark_coach_in_message_read(uuid) to authenticated;
