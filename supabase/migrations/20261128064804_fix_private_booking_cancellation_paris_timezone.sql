create or replace function private.cancel_private_booking(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking public.booking_requests%rowtype;
begin
  if auth.uid() is null or not public.is_player() then
    raise exception 'Connexion joueur requise.';
  end if;

  select *
  into v_booking
  from public.booking_requests
  where id = p_request_id
  for update;

  if not found or v_booking.player_id <> auth.uid() then
    raise exception 'Réservation introuvable.';
  end if;

  if v_booking.status not in ('pending', 'accepted') then
    raise exception 'Cette réservation ne peut plus être annulée.';
  end if;

  -- booking_requests stores local Europe/Paris wall-clock values as timestamp without time zone.
  -- Convert explicitly before comparing with now() (timestamptz), because PostgreSQL runs in UTC.
  if ((v_booking.session_date + v_booking.start_time) at time zone 'Europe/Paris') - now() < interval '24 hours' then
    raise exception 'L’annulation est impossible moins de 24 h avant le cours.';
  end if;

  update public.booking_requests
  set status = 'cancelled'
  where id = p_request_id;

  insert into public.coach_notifications(
    coach_id, player_id, notification_type, title, body, target_path
  )
  values(
    v_booking.coach_id,
    v_booking.player_id,
    'booking_cancelled',
    'Cours annulé',
    'Un joueur a annulé sa demande ou son cours.',
    'bookings'
  );
end;
$function$;