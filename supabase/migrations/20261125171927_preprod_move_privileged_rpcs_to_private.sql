-- Move user-facing privileged RPC implementations out of the exposed public schema.
-- Public entry points remain SECURITY INVOKER wrappers for compatibility with the existing app.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

CREATE OR REPLACE FUNCTION private.add_existing_player_to_coach(p_player_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_coach_id uuid:=auth.uid(); v_player_id uuid; v_email text:=lower(trim(coalesce(p_player_email,'')));
begin
 if v_coach_id is null or not public.is_coach() then raise exception 'Action réservée à un coach actif.'; end if;
 if v_email='' then raise exception 'Adresse e-mail manquante.'; end if;
 select p.id into v_player_id from public.profiles p
 where lower(p.email)=v_email and p.role='player' and p.archived_at is null limit 1;
 if v_player_id is null then raise exception 'Aucun compte joueur actif trouvé avec cette adresse.'; end if;
 if exists(select 1 from public.coach_players cp where cp.player_id=v_player_id and cp.coach_id<>v_coach_id) then
  raise exception 'Ce joueur est déjà suivi par un autre coach. Demande au coach référent de partager sa fiche.';
 end if;
 insert into public.coach_players(coach_id,player_id) values(v_coach_id,v_player_id) on conflict(coach_id,player_id) do nothing;
 return v_player_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.cancel_private_booking(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.get_player_coach_unavailability(p_coach_ids uuid[])
 RETURNS TABLE(coach_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select u.coach_id, u.starts_at, u.ends_at
  from public.coach_unavailability u
  join public.profiles p on p.id = u.coach_id
  where u.coach_id = any(coalesce(p_coach_ids, array[]::uuid[]))
    and p.role = 'coach' and p.archived_at is null
    and u.starts_at is not null and u.ends_at is not null
    and u.ends_at > u.starts_at
    and public.is_player();
$function$;

CREATE OR REPLACE FUNCTION private.invite_coach_to_player(p_player_id uuid, p_coach_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_inviter uuid:=auth.uid(); v_invited uuid; v_email text:=lower(trim(coalesce(p_coach_email,''))); v_id uuid;
begin
 if v_inviter is null or not public.is_coach() then raise exception 'Action réservée à un coach actif.'; end if;
 if not exists(select 1 from public.coach_players where coach_id=v_inviter and player_id=p_player_id) then raise exception 'Tu dois déjà suivre ce joueur.'; end if;
 if v_email='' then raise exception 'Adresse e-mail manquante.'; end if;
 select p.id into v_invited from public.profiles p where lower(p.email)=v_email and p.role='coach' and p.archived_at is null;
 if v_invited is null then raise exception 'Aucun compte coach actif trouvé avec cette adresse.'; end if;
 if v_invited=v_inviter then raise exception 'Tu ne peux pas t’inviter toi-même.'; end if;
 if exists(select 1 from public.coach_players where coach_id=v_invited and player_id=p_player_id) then raise exception 'Ce coach a déjà accès à cette fiche.'; end if;
 insert into public.coach_player_invitations(player_id,inviter_coach_id,invited_coach_id,invited_coach_email)
 values(p_player_id,v_inviter,v_invited,v_email) returning id into v_id;
 return v_id;
exception when unique_violation then raise exception 'Une invitation est déjà en attente.';
end;
$function$;

CREATE OR REPLACE FUNCTION private.mark_coach_in_message_read(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_message public.coach_player_messages%rowtype;
begin
 if auth.uid() is null then raise exception 'Connexion requise.'; end if;
 select * into v_message from public.coach_player_messages where id=p_message_id for update;
 if not found then raise exception 'Message introuvable.'; end if;
 if auth.uid()=v_message.sender_id then raise exception 'Seul le destinataire peut marquer ce message comme lu.'; end if;
 if auth.uid()=v_message.coach_id and not public.is_coach() then raise exception 'Accès refusé.'; end if;
 if auth.uid()=v_message.player_id and (
   not public.is_player()
   or not exists(select 1 from public.profiles c where c.id=v_message.coach_id and c.role='coach' and c.archived_at is null)
 ) then raise exception 'Accès refusé.'; end if;
 if auth.uid() not in (v_message.coach_id,v_message.player_id) then raise exception 'Accès refusé.'; end if;
 if not exists(select 1 from public.coach_players cp where cp.coach_id=v_message.coach_id and cp.player_id=v_message.player_id) then raise exception 'Cette conversation n’est plus active.'; end if;
 update public.coach_player_messages set read_at=coalesce(read_at,now()) where id=p_message_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.notify_player_achievement_unlocked(p_achievement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.notify_player_existing_evaluation(p_evaluation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_player_id uuid; v_evaluated_at timestamptz;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Action réservée à un coach.'; end if;
 select e.player_id,e.evaluated_at into v_player_id,v_evaluated_at from public.evaluations e join public.coach_players cp on cp.player_id=e.player_id and cp.coach_id=auth.uid() where e.id=p_evaluation_id and e.created_by=auth.uid();
 if v_player_id is null then raise exception 'Bilan introuvable ou non créé par ce coach.'; end if;
 insert into public.player_notifications(player_id,notification_type,title,body,target_path) values(v_player_id,'evaluation_shared','Ton bilan est disponible !','Ton coach vient de te partager un bilan du '||pg_catalog.to_char(v_evaluated_at at time zone 'Europe/Paris','DD/MM/YYYY')||'. Consulte ton parcours pour le découvrir.','reports');
end; $function$;

CREATE OR REPLACE FUNCTION private.register_push_subscription(p_endpoint text, p_subscription jsonb, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_endpoint is null or length(trim(p_endpoint)) = 0
     or p_subscription is null
     or p_subscription->>'endpoint' is distinct from p_endpoint then
    raise exception 'Invalid push subscription' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (
    user_id, endpoint, subscription, user_agent, updated_at
  )
  values (
    v_user_id, p_endpoint, p_subscription, p_user_agent, pg_catalog.now()
  )
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        subscription = excluded.subscription,
        user_agent = excluded.user_agent,
        updated_at = pg_catalog.now();
end;
$function$;

CREATE OR REPLACE FUNCTION private.request_private_booking(p_coach_id uuid, p_session_date date, p_start_time time without time zone, p_duration_minutes integer, p_court_number smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid := auth.uid(); v_id uuid; v_start timestamp; v_end timestamp;
  v_weekday smallint := extract(isodow from p_session_date)::smallint;
  v_school_holiday boolean := (
    p_session_date between date '2026-10-17' and date '2026-11-01'
    or p_session_date between date '2026-12-19' and date '2027-01-03'
    or p_session_date between date '2027-02-20' and date '2027-03-07'
    or p_session_date between date '2027-04-17' and date '2027-05-02'
  );
  v_public_holiday boolean := p_session_date in (
    date '2026-11-01',date '2026-11-11',date '2026-12-25',date '2027-01-01',
    date '2027-04-05',date '2027-05-01',date '2027-05-06',date '2027-05-08',date '2027-05-17'
  );
  v_first_holiday_saturday boolean := p_session_date in (
    date '2026-10-17',date '2026-12-19',date '2027-02-20',date '2027-04-17'
  );
begin
  if v_player is null or not public.is_player() then raise exception 'Connexion joueur requise.'; end if;
  if not exists (select 1 from public.profiles where id=p_coach_id and role='coach' and archived_at is null) then raise exception 'Coach invalide.'; end if;
  if not exists (select 1 from public.coach_players where coach_id=p_coach_id and player_id=v_player) then raise exception 'Ce coach ne suit pas ce joueur.'; end if;
  if p_duration_minutes not in (60,90,120) then raise exception 'Durée non autorisée.'; end if;
  if p_court_number not between 1 and 4 then raise exception 'Court invalide.'; end if;
  v_start := p_session_date + p_start_time; v_end := v_start + make_interval(mins => p_duration_minutes);
  if v_start < (timezone('Europe/Paris', now()) + interval '30 minutes') then raise exception 'La réservation doit être effectuée au moins 30 minutes avant le début du cours.'; end if;
  if p_coach_id = '5360a637-eed3-4201-87f0-437f67baffac'::uuid
     and p_session_date between date '2026-09-14' and date '2027-06-20'
     and (
       (v_weekday=1 and not v_school_holiday and not v_public_holiday and p_start_time < time '21:00' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '18:00')
       or (v_weekday=2 and not v_school_holiday and not v_public_holiday and (
         (p_start_time < time '13:45' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '12:15')
         or (p_start_time < time '20:30' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '17:30')))
       or (v_weekday=3 and not v_school_holiday and p_start_time < time '19:30' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '09:30')
       or (v_weekday=4 and not v_school_holiday and not v_public_holiday and p_start_time < time '19:30' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '18:00')
       or (v_weekday=6 and (not v_school_holiday or v_first_holiday_saturday) and p_start_time < time '13:30' and (p_start_time+make_interval(mins=>p_duration_minutes)) > time '09:30')
     ) then raise exception 'Ce créneau est bloqué par un cours collectif du Coach B.'; end if;
  if not exists (select 1 from public.coach_weekly_availability a where a.coach_id=p_coach_id and a.weekday=v_weekday and a.active=true and a.start_time<=p_start_time and a.end_time>=(p_start_time+make_interval(mins=>p_duration_minutes)) and (a.court_number is null or a.court_number=p_court_number)) then raise exception 'Ce créneau ne fait pas partie des disponibilités publiées par le coach.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_coach_id::text||p_session_date::text||p_court_number::text,0));
  if exists (select 1 from public.shared_court_occupancy o where o.coach_id=p_coach_id and o.session_date=p_session_date and o.start_time<v_end::time and o.end_time>p_start_time and o.status not in ('cancelled','canceled','rejected','annulé','annule')) then raise exception 'Le coach est déjà occupé par un cours collectif, un cours particulier ou une réservation.'; end if;
  if exists (select 1 from public.booking_requests b where b.coach_id=p_coach_id and b.session_date=p_session_date and b.court_number=p_court_number and b.status in ('pending','accepted') and (b.session_date+b.start_time)<v_end and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>v_start) then raise exception 'Ce créneau est déjà demandé ou réservé.'; end if;
  insert into public.booking_requests(coach_id,player_id,session_date,start_time,duration_minutes,court_number,status) values(p_coach_id,v_player,p_session_date,p_start_time,p_duration_minutes,p_court_number,'pending') returning id into v_id;
  insert into public.coach_notifications(coach_id,player_id,notification_type,title,body,target_path) values(p_coach_id,v_player,'booking_request','Nouvelle demande de cours','Une demande de cours particulier attend ta réponse.','bookings');
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.respond_coach_player_invitation(p_invitation_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.coach_player_invitations%rowtype;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Action réservée à un coach actif.'; end if;
 select * into v from public.coach_player_invitations where id=p_invitation_id for update;
 if not found or v.invited_coach_id<>auth.uid() then raise exception 'Invitation introuvable.'; end if;
 if v.status<>'pending' then raise exception 'Invitation déjà traitée.'; end if;
 if not exists(select 1 from public.coach_players where coach_id=v.inviter_coach_id and player_id=v.player_id) then
  raise exception 'Le partage a été retiré par le coach à l’origine de l’invitation.';
 end if;
 if not exists(select 1 from public.profiles where id=v.player_id and role='player' and archived_at is null) then
  raise exception 'Ce compte joueur n’est plus actif.';
 end if;
 if p_accept then
  insert into public.coach_players(coach_id,player_id) values(v.invited_coach_id,v.player_id) on conflict(coach_id,player_id) do nothing;
  update public.coach_player_invitations set status='accepted',responded_at=now() where id=p_invitation_id;
 else
  update public.coach_player_invitations set status='rejected',responded_at=now() where id=p_invitation_id;
 end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.review_private_booking(p_request_id uuid, p_decision text, p_coach_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.revoke_coach_player_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.coach_player_invitations%rowtype;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Action réservée à un coach actif.'; end if;
 select * into v from public.coach_player_invitations where id=p_invitation_id for update;
 if not found or v.inviter_coach_id<>auth.uid() then raise exception 'Seul le coach à l’origine du partage peut le retirer.'; end if;
 if v.status not in ('pending','accepted') then raise exception 'Ce partage a déjà été clôturé.'; end if;
 if v.status='accepted' then delete from public.coach_players where coach_id=v.invited_coach_id and player_id=v.player_id; end if;
 update public.coach_player_invitations set status='revoked',revoked_at=now() where id=p_invitation_id;
end;
$function$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
revoke all on function private.rotate_coach_referral_link(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.add_existing_player_to_coach(p_player_email text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.add_existing_player_to_coach(p_player_email); $function$;
revoke all on function public.add_existing_player_to_coach(p_player_email text) from public, anon, authenticated;
grant execute on function public.add_existing_player_to_coach(p_player_email text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_private_booking(p_request_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.cancel_private_booking(p_request_id); $function$;
revoke all on function public.cancel_private_booking(p_request_id uuid) from public, anon, authenticated;
grant execute on function public.cancel_private_booking(p_request_id uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_player_coach_unavailability(p_coach_ids uuid[])
 RETURNS TABLE(coach_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select * from private.get_player_coach_unavailability(p_coach_ids); $function$;
revoke all on function public.get_player_coach_unavailability(p_coach_ids uuid[]) from public, anon, authenticated;
grant execute on function public.get_player_coach_unavailability(p_coach_ids uuid[]) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invite_coach_to_player(p_player_id uuid, p_coach_email text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.invite_coach_to_player(p_player_id, p_coach_email); $function$;
revoke all on function public.invite_coach_to_player(p_player_id uuid, p_coach_email text) from public, anon, authenticated;
grant execute on function public.invite_coach_to_player(p_player_id uuid, p_coach_email text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_coach_in_message_read(p_message_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.mark_coach_in_message_read(p_message_id); $function$;
revoke all on function public.mark_coach_in_message_read(p_message_id uuid) from public, anon, authenticated;
grant execute on function public.mark_coach_in_message_read(p_message_id uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_player_achievement_unlocked(p_achievement_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.notify_player_achievement_unlocked(p_achievement_id); $function$;
revoke all on function public.notify_player_achievement_unlocked(p_achievement_id uuid) from public, anon, authenticated;
grant execute on function public.notify_player_achievement_unlocked(p_achievement_id uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_player_existing_evaluation(p_evaluation_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.notify_player_existing_evaluation(p_evaluation_id); $function$;
revoke all on function public.notify_player_existing_evaluation(p_evaluation_id uuid) from public, anon, authenticated;
grant execute on function public.notify_player_existing_evaluation(p_evaluation_id uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_push_subscription(p_endpoint text, p_subscription jsonb, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.register_push_subscription(p_endpoint, p_subscription, p_user_agent); $function$;
revoke all on function public.register_push_subscription(p_endpoint text, p_subscription jsonb, p_user_agent text) from public, anon, authenticated;
grant execute on function public.register_push_subscription(p_endpoint text, p_subscription jsonb, p_user_agent text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_private_booking(p_coach_id uuid, p_session_date date, p_start_time time without time zone, p_duration_minutes integer, p_court_number smallint)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.request_private_booking(p_coach_id, p_session_date, p_start_time, p_duration_minutes, p_court_number); $function$;
revoke all on function public.request_private_booking(p_coach_id uuid, p_session_date date, p_start_time time without time zone, p_duration_minutes integer, p_court_number smallint) from public, anon, authenticated;
grant execute on function public.request_private_booking(p_coach_id uuid, p_session_date date, p_start_time time without time zone, p_duration_minutes integer, p_court_number smallint) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.respond_coach_player_invitation(p_invitation_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.respond_coach_player_invitation(p_invitation_id, p_accept); $function$;
revoke all on function public.respond_coach_player_invitation(p_invitation_id uuid, p_accept boolean) from public, anon, authenticated;
grant execute on function public.respond_coach_player_invitation(p_invitation_id uuid, p_accept boolean) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_private_booking(p_request_id uuid, p_decision text, p_coach_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.review_private_booking(p_request_id, p_decision, p_coach_note); $function$;
revoke all on function public.review_private_booking(p_request_id uuid, p_decision text, p_coach_note text) from public, anon, authenticated;
grant execute on function public.review_private_booking(p_request_id uuid, p_decision text, p_coach_note text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_coach_player_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.revoke_coach_player_invitation(p_invitation_id); $function$;
revoke all on function public.revoke_coach_player_invitation(p_invitation_id uuid) from public, anon, authenticated;
grant execute on function public.revoke_coach_player_invitation(p_invitation_id uuid) to authenticated, service_role;

revoke all on function public.notify_player_new_evaluation(uuid) from public, anon, authenticated;
