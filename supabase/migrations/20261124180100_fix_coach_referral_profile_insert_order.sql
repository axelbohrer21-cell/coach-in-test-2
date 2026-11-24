create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_role text := 'player';
  v_invite public.coach_referral_invites%rowtype;
  v_token text := nullif(new.raw_user_meta_data ->> 'coach_invite_token', '');
begin
  if lower(coalesce(new.email,'')) = 'axel.bohrer21@gmail.com' then
    v_role := 'admin';
  elsif v_token is not null then
    select i.* into v_invite
    from public.coach_referral_invites i
    join public.profiles sponsor on sponsor.id=i.sponsor_coach_id
    where i.token::text=v_token and i.used_at is null and i.expires_at>now()
      and sponsor.role='coach' and sponsor.archived_at is null
    for update of i;
    if not found then raise exception 'Lien de parrainage coach invalide, expiré ou déjà utilisé.'; end if;
    v_role := 'coach';
  end if;
  insert into public.profiles(id,email,first_name,last_name,role)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data ->> 'first_name',''),coalesce(new.raw_user_meta_data ->> 'last_name',''),v_role)
  on conflict(id) do update set email=excluded.email,
    role=case when lower(coalesce(new.email,''))='axel.bohrer21@gmail.com' then 'admin' else public.profiles.role end;
  if v_token is not null and v_role='coach' then
    update public.coach_referral_invites set used_at=now(), referred_coach_id=new.id where id=v_invite.id;
    insert into public.coach_referrals(referred_coach_id,sponsor_coach_id,invite_id)
    values(new.id,v_invite.sponsor_coach_id,v_invite.id);
  end if;
  return new;
end; $function$;
revoke all on function public.handle_new_user() from public, anon, authenticated;