-- Personalized player notifications and club news fan-out.
-- Applied to production and test Supabase projects on 2026-11-24.

alter table public.notification_preferences
  add column if not exists club_news boolean not null default true;

create or replace function public.filter_coach_in_app_notification()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_enabled boolean:=true; v_user_id uuid; v_column text;
begin
 if tg_table_name='player_notifications' then v_user_id:=new.player_id; else v_user_id:=new.coach_id; end if;
 v_column:=case new.notification_type
 when 'booking_request' then 'booking_requests' when 'booking_decision' then 'booking_decisions'
 when 'booking_cancelled' then 'booking_changes' when 'booking_reminder' then 'reminders_24h'
 when 'new_message' then 'messages' when 'challenge_created' then 'progress'
 when 'challenge_completed' then 'progress' when 'achievement_unlocked' then 'progress'
 when 'session_created' then 'session_changes' when 'session_updated' then 'session_changes'
 when 'session_cancelled' then 'session_changes' when 'club_news' then 'club_news'
 when 'evaluation_shared' then 'progress' else null end;
 if v_column is not null then
  execute format('select %I from public.notification_preferences where user_id=$1',v_column) into v_enabled using v_user_id;
  v_enabled:=coalesce(v_enabled,true);
 end if;
 if not coalesce(v_enabled,true) then return null; end if;
 return new;
end;$function$;

create or replace function private.review_private_booking(p_request_id uuid,p_decision text,p_coach_note text default '')
returns void language plpgsql security definer set search_path=''
as $function$
declare v_booking public.booking_requests%rowtype; v_first_name text; v_when text; v_enabled boolean:=true;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Connexion coach requise.'; end if;
 if p_decision not in ('accepted','rejected') then raise exception 'Décision invalide.'; end if;
 select * into v_booking from public.booking_requests where id=p_request_id for update;
 if not found or v_booking.coach_id<>auth.uid() then raise exception 'Demande introuvable.'; end if;
 if v_booking.status<>'pending' then raise exception 'Cette demande a déjà été traitée.'; end if;
 if p_decision='accepted' then
  perform pg_advisory_xact_lock(hashtextextended(v_booking.coach_id::text||v_booking.session_date::text||v_booking.court_number::text,0));
  if exists(select 1 from public.booking_requests b where b.id<>v_booking.id and b.coach_id=v_booking.coach_id and b.session_date=v_booking.session_date and b.court_number=v_booking.court_number and b.status='accepted' and (b.session_date+b.start_time)<(v_booking.session_date+v_booking.start_time+make_interval(mins=>v_booking.duration_minutes)) and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>(v_booking.session_date+v_booking.start_time)) then raise exception 'Conflit : le créneau a été réservé entre-temps.'; end if;
  if exists(select 1 from public.training_sessions s where s.created_by=v_booking.coach_id and s.session_date=v_booking.session_date and coalesce(s.court_number,v_booking.court_number)=v_booking.court_number and (s.session_date+coalesce(s.session_time,time '00:00'))<(v_booking.session_date+v_booking.start_time+make_interval(mins=>v_booking.duration_minutes)) and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60)))>(v_booking.session_date+v_booking.start_time)) then raise exception 'Conflit : le coach a ajouté une séance sur ce créneau.'; end if;
  if exists(select 1 from public.group_sessions g where g.coach_id=v_booking.coach_id and g.session_date=v_booking.session_date and g.status<>'cancelled' and (g.session_date+g.start_time)<(v_booking.session_date+v_booking.start_time+make_interval(mins=>v_booking.duration_minutes)) and (g.session_date+g.end_time)>(v_booking.session_date+v_booking.start_time)) then raise exception 'Conflit : un cours collectif occupe ce créneau.'; end if;
 end if;
 update public.booking_requests set status=p_decision,coach_note=coalesce(p_coach_note,''),reviewed_at=now() where id=p_request_id;
 select coalesce(nullif(trim(first_name),''),'') into v_first_name from public.profiles where id=v_booking.player_id;
 v_when:=pg_catalog.to_char(v_booking.session_date,'DD/MM/YYYY')||' à '||pg_catalog.to_char(v_booking.start_time,'HH24:MI');
 select coalesce(booking_decisions,true) into v_enabled from public.notification_preferences where user_id=v_booking.player_id;
 if not found then v_enabled:=true; end if;
 if v_enabled then
  insert into public.player_notifications(player_id,coach_id,notification_type,title,body,target_path,source_id)
  values(v_booking.player_id,v_booking.coach_id,'booking_decision',
   case when p_decision='accepted' then case when v_first_name<>'' then v_first_name||', ton cours est confirmé !' else 'Ton cours est confirmé !' end else case when v_first_name<>'' then v_first_name||', ta demande de cours a été refusée' else 'Demande de cours refusée' end end,
   case when p_decision='accepted' then 'Ton cours particulier est confirmé pour le '||v_when||' · durée : '||v_booking.duration_minutes||' min · court '||coalesce(v_booking.court_number::text,'à confirmer')||'.' else 'Ta demande de cours particulier du '||v_when||' n’a pas été acceptée.' end,'bookings',v_booking.id);
 end if;
end;$function$;

create or replace function public.process_booking_reminders()
returns integer language plpgsql security definer set search_path=''
as $function$
declare v_booking record; v_sent integer:=0; v_player_enabled boolean; v_coach_enabled boolean; v_first_name text; v_when text;
begin
 for v_booking in select b.id,b.player_id,b.coach_id,b.session_date,b.start_time,b.duration_minutes,b.court_number from public.booking_requests b where b.status='accepted' and b.reminder_sent_at is null and ((b.session_date+b.start_time) at time zone 'Europe/Paris') between now()+interval '23 hours 45 minutes' and now()+interval '24 hours 15 minutes' order by b.session_date,b.start_time for update skip locked loop
  select coalesce(np.reminders_24h,true) into v_player_enabled from public.notification_preferences np where np.user_id=v_booking.player_id;
  if not found then v_player_enabled:=true; end if;
  select coalesce(np.reminders_24h,true) into v_coach_enabled from public.notification_preferences np where np.user_id=v_booking.coach_id;
  if not found then v_coach_enabled:=true; end if;
  select coalesce(nullif(trim(first_name),''),'') into v_first_name from public.profiles where id=v_booking.player_id;
  v_when:=pg_catalog.to_char(v_booking.session_date,'DD/MM/YYYY')||' à '||pg_catalog.to_char(v_booking.start_time,'HH24:MI');
  if v_player_enabled then insert into public.player_notifications(player_id,coach_id,notification_type,title,body,target_path,source_id) values(v_booking.player_id,v_booking.coach_id,'booking_reminder',case when v_first_name<>'' then v_first_name||', ton cours est demain !' else 'Ton cours est demain !' end,'Rendez-vous demain le '||v_when||' · durée : '||v_booking.duration_minutes||' min · court '||coalesce(v_booking.court_number::text,'à confirmer')||'.','bookings',v_booking.id); end if;
  if v_coach_enabled then insert into public.coach_notifications(coach_id,player_id,notification_type,title,body,target_path) values(v_booking.coach_id,v_booking.player_id,'booking_reminder','Cours particulier demain','Rappel : un cours particulier avec '||coalesce(nullif(v_first_name,''),'ton joueur')||' est prévu demain, le '||v_when||'.','bookings'); end if;
  update public.booking_requests set reminder_sent_at=now() where id=v_booking.id; v_sent:=v_sent+1;
 end loop; return v_sent;
end;$function$;

create or replace function private.notify_player_existing_evaluation(p_evaluation_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_player_id uuid; v_coach_id uuid; v_evaluated_at timestamptz; v_first_name text;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Action réservée à un coach.'; end if;
 select e.player_id,e.created_by,e.evaluated_at into v_player_id,v_coach_id,v_evaluated_at
 from public.evaluations e join public.coach_players cp on cp.player_id=e.player_id and cp.coach_id=auth.uid()
 where e.id=p_evaluation_id and e.created_by=auth.uid();
 if v_player_id is null then raise exception 'Bilan introuvable ou non créé par ce coach.'; end if;
 select coalesce(nullif(trim(first_name),''),'') into v_first_name from public.profiles where id=v_player_id;
 insert into public.player_notifications(player_id,coach_id,notification_type,title,body,target_path,source_id)
 values(v_player_id,v_coach_id,'evaluation_shared',case when v_first_name<>'' then v_first_name||', ton bilan est disponible !' else 'Ton bilan est disponible !' end,
 'Ton coach vient de te partager un bilan du '||pg_catalog.to_char(v_evaluated_at at time zone 'Europe/Paris','DD/MM/YYYY')||'. Consulte ton parcours pour le découvrir.','reports',p_evaluation_id)
 on conflict(player_id,notification_type,coach_id,source_id) where source_id is not null do nothing;
end;$function$;

create or replace function public.notify_players_club_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_title text; v_when text;
begin
 if not coalesce(new.published,false) then return new; end if;
 if tg_op='UPDATE' and old.title is not distinct from new.title and old.description is not distinct from new.description and old.starts_at is not distinct from new.starts_at and old.location is not distinct from new.location and old.signup_url is not distinct from new.signup_url and old.published is not distinct from new.published then return new; end if;
 v_title:=case when tg_op='INSERT' or not coalesce(old.published,false) then 'Nouvelle actualité du club' else 'Actualité du club mise à jour' end;
 v_when:=pg_catalog.to_char(new.starts_at at time zone 'Europe/Paris','DD/MM/YYYY à HH24:MI');
 insert into public.player_notifications(player_id,coach_id,notification_type,title,body,target_path,source_id)
 select cp.player_id,new.created_by,'club_news',coalesce(nullif(trim(p.first_name),''),'')||case when coalesce(nullif(trim(p.first_name),''),'')<>'' then ', ' else '' end||v_title,
 '« '||new.title||' » · '||v_when||case when coalesce(new.location,'')<>'' then ' · '||new.location else '' end||case when coalesce(new.description,'')<>'' then E'\\n'||left(new.description,350) else '' end,'club',new.id
 from public.coach_players cp join public.profiles p on p.id=cp.player_id and p.role='player' where cp.coach_id=new.created_by
 on conflict(player_id,notification_type,coach_id,source_id) where source_id is not null do update set title=excluded.title,body=excluded.body,created_at=now(),read_at=null;
 return new;
end;$function$;

drop trigger if exists coach_in_club_event_notification on public.club_events;
create trigger coach_in_club_event_notification after insert or update of title,description,starts_at,location,signup_url,published on public.club_events for each row execute function public.notify_players_club_event();
revoke all on function public.notify_players_club_event() from public,anon,authenticated;
