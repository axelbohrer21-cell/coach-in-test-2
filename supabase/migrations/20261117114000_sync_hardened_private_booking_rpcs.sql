-- Synchronize hardened private-booking RPC definitions with the live database.
create or replace function public.request_private_booking(
 p_coach_id uuid,p_session_date date,p_start_time time without time zone,
 p_duration_minutes integer,p_court_number smallint
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_id uuid; v_start timestamp; v_end timestamp;
begin
 if v_player is null or not public.is_player() then raise exception 'Connexion joueur requise.'; end if;
 if not exists(select 1 from public.profiles where id=p_coach_id and role='coach' and archived_at is null) then raise exception 'Coach invalide.'; end if;
 if not exists(select 1 from public.coach_players where coach_id=p_coach_id and player_id=v_player) then raise exception 'Ce coach ne suit pas ce joueur.'; end if;
 if p_duration_minutes not in(60,90,120) then raise exception 'Durée non autorisée.'; end if;
 if p_court_number not between 1 and 4 then raise exception 'Court invalide.'; end if;
 v_start:=p_session_date+p_start_time; v_end:=v_start+make_interval(mins=>p_duration_minutes);
 if v_start<=now() then raise exception 'Le créneau doit être dans le futur.'; end if;
 if not exists(select 1 from public.coach_weekly_availability a where a.coach_id=p_coach_id
   and a.weekday=extract(isodow from p_session_date)::smallint and a.active=true
   and a.start_time<=p_start_time and a.end_time>=(p_start_time+make_interval(mins=>p_duration_minutes))
   and (a.court_number is null or a.court_number=p_court_number)) then
   raise exception 'Ce créneau ne fait pas partie des disponibilités publiées par le coach.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_coach_id::text||p_session_date::text||p_court_number::text,0));
 if exists(select 1 from public.booking_requests b where b.coach_id=p_coach_id and b.session_date=p_session_date
   and b.court_number=p_court_number and b.status in('pending','accepted')
   and (b.session_date+b.start_time)<v_end
   and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>v_start) then
   raise exception 'Ce créneau est déjà demandé ou réservé.';
 end if;
 if exists(select 1 from public.training_sessions s where s.created_by=p_coach_id and s.session_date=p_session_date
   and coalesce(s.court_number,p_court_number)=p_court_number
   and (s.session_date+coalesce(s.session_time,time '00:00'))<v_end
   and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60)))>v_start) then
   raise exception 'Le coach a déjà une séance sur ce créneau.';
 end if;
 if exists(select 1 from public.group_sessions g where g.coach_id=p_coach_id and g.session_date=p_session_date
   and g.status<>'cancelled' and (g.session_date+g.start_time)<v_end and (g.session_date+g.end_time)>v_start) then
   raise exception 'Le coach est indisponible : un cours collectif est prévu sur ce créneau.';
 end if;
 insert into public.booking_requests(coach_id,player_id,session_date,start_time,duration_minutes,court_number,status)
 values(p_coach_id,v_player,p_session_date,p_start_time,p_duration_minutes,p_court_number,'pending') returning id into v_id;
 insert into public.coach_notifications(coach_id,player_id,notification_type,title,body,target_path)
 values(p_coach_id,v_player,'booking_request','Nouvelle demande de cours','Une demande de cours particulier attend ta réponse.','bookings');
 return v_id;
end;
$$;

create or replace function public.cancel_private_booking(p_request_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_booking public.booking_requests%rowtype;
begin
 if auth.uid() is null or not public.is_player() then raise exception 'Connexion joueur requise.'; end if;
 select * into v_booking from public.booking_requests where id=p_request_id for update;
 if not found or v_booking.player_id<>auth.uid() then raise exception 'Réservation introuvable.'; end if;
 if v_booking.status not in ('pending','accepted') then raise exception 'Cette réservation ne peut plus être annulée.'; end if;
 if (v_booking.session_date+v_booking.start_time)-now()<interval '24 hours' then raise exception 'L’annulation est impossible moins de 24 h avant le cours.'; end if;
 update public.booking_requests set status='cancelled' where id=p_request_id;
 insert into public.coach_notifications(coach_id,player_id,notification_type,title,body,target_path)
 values(v_booking.coach_id,v_booking.player_id,'booking_cancelled','Cours annulé','Un joueur a annulé sa demande ou son cours.','bookings');
end;
$$;

create or replace function public.review_private_booking(
 p_request_id uuid,p_decision text,p_coach_note text default ''
) returns void language plpgsql security definer set search_path=''
as $$
declare v_booking public.booking_requests%rowtype;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Connexion coach requise.'; end if;
 if p_decision not in ('accepted','rejected') then raise exception 'Décision invalide.'; end if;
 select * into v_booking from public.booking_requests where id=p_request_id for update;
 if not found or v_booking.coach_id<>auth.uid() then raise exception 'Demande introuvable.'; end if;
 if v_booking.status<>'pending' then raise exception 'Cette demande a déjà été traitée.'; end if;
 if p_decision='accepted' then
  perform pg_advisory_xact_lock(hashtextextended(v_booking.coach_id::text||v_booking.session_date::text||v_booking.court_number::text,0));
  if exists(select 1 from public.booking_requests b where b.id<>v_booking.id and b.coach_id=v_booking.coach_id
    and b.session_date=v_booking.session_date and b.court_number=v_booking.court_number and b.status='accepted'
    and (b.session_date+b.start_time)<(v_booking.session_date+v_booking.start_time+make_interval(mins=>v_booking.duration_minutes))
    and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>(v_booking.session_date+v_booking.start_time)) then
    raise exception 'Conflit : le créneau a été réservé entre-temps.';
  end if;
  if exists(select 1 from public.training_sessions s where s.created_by=v_booking.coach_id and s.session_date=v_booking.session_date
    and coalesce(s.court_number,v_booking.court_number)=v_booking.court_number
    and (s.session_date+coalesce(s.session_time,time '00:00'))<(v_booking.session_date+v_booking.start_time+make_interval(mins=>v_booking.duration_minutes))
    and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60)))>(v_booking.session_date+v_booking.start_time)) then
    raise exception 'Conflit : le coach a ajouté une séance sur ce créneau.';
  end if;
  if exists(select 1 from public.group_sessions g where g.coach_id=v_booking.coach_id and g.session_date=v_booking.session_date
    and g.status<>'cancelled'
    and (g.session_date+g.start_time)<(v_booking.session_date+v_booking.start_time+make_interval(mins=>v_booking.duration_minutes))
    and (g.session_date+g.end_time)>(v_booking.session_date+v_booking.start_time)) then
    raise exception 'Conflit : un cours collectif occupe ce créneau.';
  end if;
 end if;
 update public.booking_requests set status=p_decision,coach_note=coalesce(p_coach_note,''),reviewed_at=now() where id=p_request_id;
 insert into public.player_notifications(player_id,notification_type,title,body,target_path)
 values(v_booking.player_id,'booking_decision',
  case when p_decision='accepted' then 'Cours confirmé' else 'Demande refusée' end,
  case when p_decision='accepted' then 'Ta demande de cours particulier a été acceptée.' else 'Ta demande de cours particulier n’a pas été acceptée.' end,
  'bookings');
end;
$$;