-- Coach In — séries annuelles de cours collectifs, migration additive.
-- À exécuter uniquement après sauvegarde et validation sur une base de préproduction.
create table if not exists public.group_course_series (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  audience text not null check (audience in ('adultes','enfants')),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  court_number smallint not null check (court_number between 1 and 4),
  target_sessions integer not null check (target_sessions > 0),
  theme text not null default '',
  season_start date not null default date '2026-09-14',
  season_end date not null default date '2027-06-20',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check ((audience = 'adultes' and weekday in (1,2,4,5)) or (audience = 'enfants' and weekday in (3,6)))
);

alter table public.group_sessions
  add column if not exists series_id uuid references public.group_course_series(id) on delete set null;

create index if not exists idx_group_course_series_coach on public.group_course_series(coach_id, weekday, start_time);
create index if not exists idx_group_sessions_series_date on public.group_sessions(series_id, session_date);
create unique index if not exists idx_group_sessions_series_unique_date
  on public.group_sessions(series_id, session_date) where series_id is not null;

alter table public.group_course_series enable row level security;
drop policy if exists group_course_series_owner_all on public.group_course_series;
create policy group_course_series_owner_all on public.group_course_series
  for all to authenticated
  using (coach_id = (select auth.uid()) and public.is_coach())
  with check (coach_id = (select auth.uid()) and public.is_coach());

comment on table public.group_course_series is 'Un compteur annuel indépendant par créneau collectif réel (jour, heure, court et public).';
comment on column public.group_course_series.target_sessions is 'Objectif minimal annuel : généralement 28 adultes ou 30 enfants.';
