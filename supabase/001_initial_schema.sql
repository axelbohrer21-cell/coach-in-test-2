-- COACH IN — initialisation d'un projet Supabase NEUF
-- À exécuter uniquement sur le projet de PRÉPRODUCTION vide.
-- Ensuite : 002_coach_in_modules.sql, 003_group_course_series.sql,
-- puis 004_shared_player_profiles.sql.
-- Ce script ne crée aucun compte coach et n'attribue aucun rôle privilégié.

begin;
create extension if not exists pgcrypto;

-- Profils liés à auth.users. Les nouveaux comptes sont joueurs par défaut.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'player' check (role in ('player','coach','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id,email,first_name,last_name,role)
  values (
    new.id,
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data ->> 'first_name',''),
    coalesce(new.raw_user_meta_data ->> 'last_name',''),
    'player'
  )
  on conflict (id) do update set email=excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Relation de suivi : un joueur peut être rattaché à plusieurs coachs.
create table if not exists public.coach_players (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id,player_id),
  check (coach_id <> player_id)
);
create index if not exists idx_coach_players_player on public.coach_players(player_id,coach_id);

-- Séances individuelles : l'auteur est conservé, le dossier est partagé entre les coachs liés.
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  session_date date not null default current_date,
  session_time time,
  duration_minutes integer not null default 60 check (duration_minutes in (30,45,60,75,90,120)),
  theme text not null default '',
  exercise_1 text not null default '',
  exercise_2 text not null default '',
  return_to_match text not null default '',
  player_visible_summary text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_training_sessions_player_date on public.training_sessions(player_id,session_date desc);

-- Évaluations et critères détaillés.
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.training_sessions(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  evaluated_at timestamptz not null default now(),
  score numeric(4,2),
  technical_score numeric(4,2),
  tactical_score numeric(4,2),
  physical_score numeric(4,2),
  mental_score numeric(4,2),
  player_visible_comment text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_evaluations_player_date on public.evaluations(player_id,evaluated_at desc);

-- Fonction de rôle utilisée par les politiques RLS des modules.
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('coach','admin')
  );
$$;

-- Accès de base : aucun accès transversal. Les vues joueur n'exposent que les champs prévus.
alter table public.profiles enable row level security;
alter table public.coach_players enable row level security;
alter table public.training_sessions enable row level security;
alter table public.evaluations enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select to authenticated using (id = (select auth.uid()));

-- Les relations ne sont visibles qu'à leurs deux parties. Les écritures passent par les RPC d'invitation.
drop policy if exists coach_players_select_participant on public.coach_players;
create policy coach_players_select_participant on public.coach_players
for select to authenticated using (coach_id = (select auth.uid()) or player_id = (select auth.uid()));
revoke insert,update,delete on public.coach_players from authenticated;
grant select on public.coach_players to authenticated;

-- Les politiques ci-dessous seront remplacées par le partage complet dans la migration 004.
drop policy if exists sessions_select_coach_only on public.training_sessions;
create policy sessions_select_coach_only on public.training_sessions
for select to authenticated using (
  public.is_coach() and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid()) and cp.player_id = training_sessions.player_id
  )
);
drop policy if exists sessions_coach_insert on public.training_sessions;
create policy sessions_coach_insert on public.training_sessions
for insert to authenticated with check (
  public.is_coach() and created_by = (select auth.uid()) and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid()) and cp.player_id = training_sessions.player_id
  )
);
drop policy if exists sessions_coach_update on public.training_sessions;
create policy sessions_coach_update on public.training_sessions
for update to authenticated using (
  public.is_coach() and exists (select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=training_sessions.player_id)
) with check (
  public.is_coach() and exists (select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=training_sessions.player_id)
);
drop policy if exists sessions_coach_delete on public.training_sessions;
create policy sessions_coach_delete on public.training_sessions
for delete to authenticated using (
  public.is_coach() and exists (select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=training_sessions.player_id)
);

drop policy if exists evaluations_coach_all on public.evaluations;
create policy evaluations_coach_all on public.evaluations
for all to authenticated using (
  public.is_coach() and exists (select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=evaluations.player_id)
) with check (
  public.is_coach() and created_by=(select auth.uid()) and exists (select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=evaluations.player_id)
);

-- Vues filtrées : un joueur ne voit que ses propres informations publiables.
create or replace view public.player_sessions with (security_invoker=false) as
select id,player_id,session_date,session_time,duration_minutes,theme,exercise_1,exercise_2,
       return_to_match,player_visible_summary,created_at
from public.training_sessions where player_id=(select auth.uid());
grant select on public.player_sessions to authenticated;

create or replace view public.player_evaluations with (security_invoker=false) as
select id,player_id,session_id,evaluated_at,score,technical_score,tactical_score,
       physical_score,mental_score,player_visible_comment,created_at
from public.evaluations where player_id=(select auth.uid());
grant select on public.player_evaluations to authenticated;

commit;
