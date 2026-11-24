create table if not exists public.coach_referral_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  sponsor_coach_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_at timestamptz,
  referred_coach_id uuid references public.profiles(id) on delete set null
);
create index if not exists coach_referral_invites_sponsor_created_idx on public.coach_referral_invites(sponsor_coach_id, created_at desc);
alter table public.coach_referral_invites enable row level security;
revoke all on public.coach_referral_invites from public, anon, authenticated;
create table if not exists public.coach_referrals (
  referred_coach_id uuid primary key references public.profiles(id) on delete cascade,
  sponsor_coach_id uuid not null references public.profiles(id) on delete restrict,
  invite_id uuid not null unique references public.coach_referral_invites(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint coach_referrals_not_self check (referred_coach_id <> sponsor_coach_id)
);
alter table public.coach_referrals enable row level security;
revoke all on public.coach_referrals from public, anon, authenticated;
create or replace function public.create_coach_referral_invite()
returns text language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_token uuid;
begin
  if v_user_id is null then raise exception 'Connexion requise.'; end if;
  if not exists (select 1 from public.profiles p where p.id=v_user_id and p.role='coach' and p.archived_at is null) then
    raise exception 'Seul un coach actif peut parrainer un nouveau coach.';
  end if;
  v_token := gen_random_uuid();
  insert into public.coach_referral_invites(token,sponsor_coach_id) values(v_token,v_user_id);
  return v_token::text;
end; $$;
revoke all on function public.create_coach_referral_invite() from public, anon;
grant execute on function public.create_coach_referral_invite() to authenticated;
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
    update public.coach_referral_invites set used_at=now(), referred_coach_id=new.id where id=v_invite.id;
    insert into public.coach_referrals(referred_coach_id,sponsor_coach_id,invite_id)
    values(new.id,v_invite.sponsor_coach_id,v_invite.id);
  end if;
  insert into public.profiles(id,email,first_name,last_name,role)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data ->> 'first_name',''),coalesce(new.raw_user_meta_data ->> 'last_name',''),v_role)
  on conflict(id) do update set email=excluded.email,
    role=case when lower(coalesce(new.email,''))='axel.bohrer21@gmail.com' then 'admin' else public.profiles.role end;
  return new;
end; $function$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
