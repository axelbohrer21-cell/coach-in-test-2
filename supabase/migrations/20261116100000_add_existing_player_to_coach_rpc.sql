-- Safely associate an existing player account to the currently authenticated coach by email.
create or replace function public.add_existing_player_to_coach(p_player_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_coach_id uuid := auth.uid();
  v_player_id uuid;
  v_email text := lower(trim(coalesce(p_player_email, '')));
begin
  if v_coach_id is null or not public.is_coach() then
    raise exception 'Action réservée à un coach.';
  end if;
  if v_email = '' then
    raise exception 'Adresse e-mail manquante.';
  end if;

  select p.id
    into v_player_id
  from public.profiles p
  where lower(p.email) = v_email
    and p.role = 'player'
    and p.archived_at is null
  limit 1;

  if v_player_id is null then
    raise exception 'Aucun compte joueur actif trouvé avec cette adresse.';
  end if;

  insert into public.coach_players(coach_id, player_id)
  values (v_coach_id, v_player_id)
  on conflict (coach_id, player_id) do nothing;

  return v_player_id;
end;
$function$;

revoke all on function public.add_existing_player_to_coach(text) from public;
revoke all on function public.add_existing_player_to_coach(text) from anon;
grant execute on function public.add_existing_player_to_coach(text) to authenticated;
