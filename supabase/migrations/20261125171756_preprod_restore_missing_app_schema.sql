-- Coach In preproduction reconciliation (additive only).
-- Restores production-backed application objects while preserving all existing rows.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- 1) Missing application columns.
alter table public.profiles add column if not exists player_color text;
alter table public.evaluations add column if not exists coach_private_notes text;
alter table public.player_notifications add column if not exists source_id uuid;

-- Player color palette, unique per player.
alter table public.profiles
  drop constraint if exists profiles_player_color_allowed;
alter table public.profiles
  add constraint profiles_player_color_allowed
  check (
    role <> 'player'
    or player_color is null
    or player_color = any (array[
      '#00A6FB','#F72585','#2EC4B6','#FF9F1C','#7B2CBF',
      '#E63946','#43AA8B','#4361EE','#F15BB5','#90BE6D',
      '#FF6B6B','#277DA1','#F9C74F','#9B5DE5','#00B4D8',
      '#F3722C','#80B918','#577590','#D81159','#4D908E',
      '#A06CD5','#E76F51','#4895EF','#B5179E','#06D6A0',
      '#FF7F11','#5E60CE','#C9184A','#52B788','#3A86FF',
      '#FF4D6D','#2A9D8F','#F4A261','#6A4C93','#1982C4',
      '#8AC926','#FF595E','#00A896','#9D4EDD','#F9844A',
      '#0077B6','#D65DB1','#6C757D','#BC6C25','#4CC9F0',
      '#E9C46A','#8338EC','#588157','#EF476F','#3D5A80'
    ]::text[])
  );

create unique index if not exists profiles_unique_player_color
  on public.profiles(player_color)
  where role = 'player' and player_color is not null;

create or replace function public.assign_unique_player_color()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
declare
  palette text[] := array[
    '#00A6FB','#F72585','#2EC4B6','#FF9F1C','#7B2CBF',
    '#E63946','#43AA8B','#4361EE','#F15BB5','#90BE6D',
    '#FF6B6B','#277DA1','#F9C74F','#9B5DE5','#00B4D8',
    '#F3722C','#80B918','#577590','#D81159','#4D9084',
    '#A06CD5','#E76F51','#4895EF','#B5179E','#06D6A0',
    '#FF7F11','#5E60CE','#C9184A','#52B788','#3A86FF',
    '#FF4D6D','#2A9D8F','#F4A261','#6A4C93','#1982C4',
    '#8AC926','#FF595E','#00A896','#9D4EDD','#F9844A',
    '#0077B6','#D65DB1','#6C757D','#BC6C25','#4CC9F0',
    '#E9C46A','#8338EC','#588157','#EF476F','#4D9084'
  ]::text[];
  selected_color text;
begin
  if new.role <> 'player' or new.player_color is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(824731905);

  select color into selected_color
  from unnest(palette) as color
  where not exists (
    select 1
    from public.profiles existing
    where existing.role = 'player'
      and existing.player_color = color
      and existing.id is distinct from new.id
  )
  order by array_position(palette, color)
  limit 1;

  if selected_color is null then
    raise exception 'Les 50 couleurs de joueurs sont déjà attribuées.';
  end if;

  new.player_color := selected_color;
  return new;
end;
$function$;

revoke all on function public.assign_unique_player_color() from public, anon, authenticated;

-- Assign colors to existing preview players only; no profile identity fields are changed.
do $backfill$
declare
  palette text[] := array[
    '#00A6FB','#F72585','#2EC4B6','#FF9F1C','#7B2CBF',
    '#E63946','#43AA8B','#4361EE','#F15BB5','#90BE6D',
    '#FF6B6B','#277DA1','#F9C74F','#9B5DE5','#00B4D8',
    '#F3722C','#80B918','#577590','#D81159','#4D9084',
    '#A06CD5','#E76F51','#4895EF','#B5179E','#06D6A0',
    '#FF7F11','#5E60CE','#C9184A','#52B788','#3A86FF',
    '#FF4D6D','#2A9D8F','#F4A261','#6A4C93','#1982C4',
    '#8AC926','#FF595E','#00A896','#9D4EDD','#F9844A',
    '#0077B6','#D65DB1','#6C757D','#BC6C25','#4CC9F0',
    '#E9C46A','#8338EC','#588157','#EF476F','#4D9084'
  ]::text[];
begin
  if (
    select count(*) from public.profiles
    where role = 'player' and player_color is null
  ) > cardinality(palette) then
    raise exception 'Plus de 50 joueurs sans couleur : attribution automatique interrompue.';
  end if;

  with unassigned as (
    select id, row_number() over (order by id) as rn
    from public.profiles
    where role = 'player' and player_color is null
  ),
  assignments as (
    select u.id, palette[u.rn::integer] as color
    from unassigned u
  )
  update public.profiles p
  set player_color = a.color
  from assignments a
  where p.id = a.id;
end;
$backfill$;

drop trigger if exists profiles_assign_unique_player_color on public.profiles;
create trigger profiles_assign_unique_player_color
before insert or update of role, player_color on public.profiles
for each row execute function public.assign_unique_player_color();

create unique index if not exists player_notifications_source_once_uidx
  on public.player_notifications(player_id, notification_type, coach_id, source_id)
  where source_id is not null;

-- 2) Physical training programs.
create table if not exists public.coach_physical_programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  program_type text not null default 'generated',
  focus_criteria text[] not null default '{}'::text[],
  group_size integer not null default 4,
  age_group text not null default '11-14',
  level text not null default 'intermediaire',
  equipment text not null default 'basic',
  duration_minutes integer not null default 60,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_physical_programs_duration_minutes_check check (duration_minutes = 60),
  constraint coach_physical_programs_group_size_check check (group_size >= 4 and group_size <= 10),
  constraint coach_physical_programs_program_type_check check (program_type = any (array['template','generated','cycle']::text[]))
);
create index if not exists coach_physical_programs_coach_created_idx
  on public.coach_physical_programs(coach_id, created_at desc);
alter table public.coach_physical_programs enable row level security;
revoke all on public.coach_physical_programs from public, anon;
grant select, insert, update, delete on public.coach_physical_programs to authenticated;
drop policy if exists coach_physical_programs_owner_all on public.coach_physical_programs;
create policy coach_physical_programs_owner_all
on public.coach_physical_programs for all to authenticated
using (coach_id = (select auth.uid()) and private.is_coach())
with check (coach_id = (select auth.uid()) and private.is_coach());

-- 3) Coach session favorites.
create table if not exists public.coach_session_favorites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint coach_session_favorites_unique unique (coach_id, session_id)
);
create index if not exists idx_coach_session_favorites_session_id
  on public.coach_session_favorites(session_id);
alter table public.coach_session_favorites enable row level security;
revoke all on public.coach_session_favorites from public, anon;
grant select, insert, delete on public.coach_session_favorites to authenticated;
drop policy if exists "Coach reads own session favorites" on public.coach_session_favorites;
create policy "Coach reads own session favorites"
on public.coach_session_favorites for select to authenticated
using (coach_id = (select auth.uid()) and private.is_coach());
drop policy if exists "Coach favorites own sessions" on public.coach_session_favorites;
create policy "Coach favorites own sessions"
on public.coach_session_favorites for insert to authenticated
with check (
  coach_id = (select auth.uid()) and private.is_coach()
  and exists (
    select 1 from public.training_sessions s
    join public.coach_players cp on cp.player_id = s.player_id
    where s.id = session_id
      and s.created_by = (select auth.uid())
      and cp.coach_id = (select auth.uid())
  )
);
drop policy if exists "Coach removes own session favorites" on public.coach_session_favorites;
create policy "Coach removes own session favorites"
on public.coach_session_favorites for delete to authenticated
using (
  coach_id = (select auth.uid()) and private.is_coach()
  and exists (
    select 1 from public.training_sessions s
    join public.coach_players cp on cp.player_id = s.player_id
    where s.id = session_id
      and s.created_by = (select auth.uid())
      and cp.coach_id = (select auth.uid())
  )
);

-- 4) Minimal coach directory, with names only and RLS for players.
create table if not exists public.player_coach_directory (
  id uuid primary key references public.profiles(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default ''
);
alter table public.player_coach_directory enable row level security;
revoke all on public.player_coach_directory from public, anon;
grant select on public.player_coach_directory to authenticated;
drop policy if exists player_coach_directory_player_read on public.player_coach_directory;
create policy player_coach_directory_player_read
on public.player_coach_directory for select to authenticated
using (private.is_player());

create or replace function public.sync_player_coach_directory()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.player_coach_directory where id = old.id;
    return old;
  end if;

  if new.role = 'coach' and new.archived_at is null then
    insert into public.player_coach_directory(id, first_name, last_name)
    values(new.id, coalesce(new.first_name,''), coalesce(new.last_name,''))
    on conflict (id) do update
      set first_name = excluded.first_name,
          last_name = excluded.last_name;
  else
    delete from public.player_coach_directory where id = new.id;
  end if;
  return new;
end;
$function$;
revoke all on function public.sync_player_coach_directory() from public, anon, authenticated;

drop trigger if exists sync_player_coach_directory_trigger on public.profiles;
create trigger sync_player_coach_directory_trigger
after insert or update of first_name, last_name, role, archived_at or delete
on public.profiles
for each row execute function public.sync_player_coach_directory();

insert into public.player_coach_directory(id, first_name, last_name)
select id, coalesce(first_name,''), coalesce(last_name,'')
from public.profiles
where role = 'coach' and archived_at is null
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name;

-- 5) Coach referral records and stable referral links.
create table if not exists public.coach_referral_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  sponsor_coach_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_at timestamptz,
  referred_coach_id uuid references public.profiles(id) on delete set null
);
create index if not exists coach_referral_invites_sponsor_created_idx
  on public.coach_referral_invites(sponsor_coach_id, created_at desc);
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

create table if not exists public.coach_referral_links (
  id uuid primary key default gen_random_uuid(),
  sponsor_coach_id uuid not null unique references public.profiles(id) on delete cascade,
  current_invite_id uuid references public.coach_referral_invites(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.coach_referral_links enable row level security;
revoke all on public.coach_referral_links from public, anon, authenticated;

insert into public.coach_referral_links(sponsor_coach_id)
select id from public.profiles
where role = 'coach' and archived_at is null
on conflict (sponsor_coach_id) do nothing;

create or replace function private.rotate_coach_referral_link(p_link_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_link public.coach_referral_links%rowtype;
  v_invite public.coach_referral_invites%rowtype;
  v_token uuid;
begin
  select * into v_link
  from public.coach_referral_links
  where id = p_link_id
  for update;

  if not found then return null; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_link.sponsor_coach_id
      and p.role = 'coach'
      and p.archived_at is null
  ) then
    return null;
  end if;

  select * into v_invite
  from public.coach_referral_invites
  where id = v_link.current_invite_id
  for update;

  if not found
     or v_invite.used_at is not null
     or v_invite.expires_at <= now() + interval '1 hour' then
    if found and v_invite.used_at is null then
      update public.coach_referral_invites
      set expires_at = now()
      where id = v_invite.id;
    end if;

    v_token := gen_random_uuid();
    insert into public.coach_referral_invites(token, sponsor_coach_id, expires_at)
    values(v_token, v_link.sponsor_coach_id, now() + interval '14 days')
    returning id into v_link.current_invite_id;

    update public.coach_referral_links
    set current_invite_id = v_link.current_invite_id,
        updated_at = now()
    where id = p_link_id;

    return v_token::text;
  end if;

  return v_invite.token::text;
end;
$function$;
revoke all on function private.rotate_coach_referral_link(uuid) from public, anon, authenticated;

create or replace function public.create_coach_referral_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_link_id uuid;
begin
  if v_user_id is null then
    raise exception 'Connexion requise.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'coach' and p.archived_at is null
  ) then
    raise exception 'Seul un coach actif peut parrainer un nouveau coach.';
  end if;

  insert into public.coach_referral_links(sponsor_coach_id)
  values(v_user_id)
  on conflict (sponsor_coach_id) do nothing;

  select id into v_link_id
  from public.coach_referral_links
  where sponsor_coach_id = v_user_id;

  perform private.rotate_coach_referral_link(v_link_id);
  return v_link_id::text;
end;
$function$;
revoke all on function public.create_coach_referral_invite() from public, anon;
grant execute on function public.create_coach_referral_invite() to authenticated;

create or replace function public.resolve_coach_referral_link(p_link_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return private.rotate_coach_referral_link(p_link_id);
end;
$function$;
revoke all on function public.resolve_coach_referral_link(uuid) from public;
grant execute on function public.resolve_coach_referral_link(uuid) to anon, authenticated;

create or replace function public.rotate_expiring_coach_referral_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_link record;
  v_rotated integer := 0;
  v_before text;
  v_after text;
begin
  for v_link in select id from public.coach_referral_links
  loop
    select i.token::text into v_before
    from public.coach_referral_links l
    left join public.coach_referral_invites i on i.id = l.current_invite_id
    where l.id = v_link.id;

    v_after := private.rotate_coach_referral_link(v_link.id);

    if v_after is not null and v_after is distinct from v_before then
      v_rotated := v_rotated + 1;
    end if;
  end loop;
  return v_rotated;
end;
$function$;
revoke all on function public.rotate_expiring_coach_referral_invites() from public, anon, authenticated;

-- Update only the new-user trigger's function; the existing auth.users trigger remains in place.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
    join public.profiles sponsor on sponsor.id = i.sponsor_coach_id
    where i.token::text = v_token
      and i.used_at is null
      and i.expires_at > now()
      and sponsor.role = 'coach'
      and sponsor.archived_at is null
    for update of i;

    if not found then
      raise exception 'Lien de parrainage coach invalide, expiré ou déjà utilisé.';
    end if;
    v_role := 'coach';
  end if;

  insert into public.profiles(id, email, first_name, last_name, role)
  values(
    new.id,
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data ->> 'first_name',''),
    coalesce(new.raw_user_meta_data ->> 'last_name',''),
    v_role
  )
  on conflict(id) do update
    set email = excluded.email,
        role = case
          when lower(coalesce(new.email,'')) = 'axel.bohrer21@gmail.com'
          then 'admin'
          else public.profiles.role
        end;

  if v_token is not null and v_role = 'coach' then
    update public.coach_referral_invites
    set used_at = now(), referred_coach_id = new.id
    where id = v_invite.id;

    insert into public.coach_referrals(referred_coach_id, sponsor_coach_id, invite_id)
    values(new.id, v_invite.sponsor_coach_id, v_invite.id);
  end if;

  return new;
end;
$function$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

do $schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'coach-referral-links-rotate-hourly'
  limit 1;

  if v_job_id is null then
    perform cron.schedule(
      'coach-referral-links-rotate-hourly',
      '0 * * * *',
      'select public.rotate_expiring_coach_referral_invites();'
    );
  end if;
end;
$schedule$;

comment on table public.player_coach_directory is
  'Annuaire minimal des coachs actifs : identifiant et nom uniquement, destiné à la sélection côté joueur.';
comment on table public.coach_physical_programs is
  'Programmes de préparation physique privés à chaque coach.';
comment on table public.coach_session_favorites is
  'Favoris privés des séances individuelles du coach.';
