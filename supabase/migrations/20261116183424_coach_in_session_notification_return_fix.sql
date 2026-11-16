
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
