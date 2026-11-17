-- Coach In: player experience (profile details, private match journal, club events)
create table if not exists public.player_profile_details (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  objective text not null default '',
  motivation text not null default '',
  strengths text not null default '',
  focus text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.player_match_journal (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  match_date date not null default current_date,
  opponent_name text not null default '',
  opponent_ranking text not null default '',
  competition text not null default '',
  score text not null default '',
  result text not null check (result in ('Victoire','Défaite','Égalité')),
  feelings text not null default '',
  worked_well text not null default '',
  to_improve text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_match_journal_player_date_idx
  on public.player_match_journal (player_id, match_date desc);

create table if not exists public.club_events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  title text not null,
  event_type text not null default 'Événement',
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '',
  signup_url text not null default '',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_events_valid_dates check (ends_at is null or ends_at >= starts_at)
);

create index if not exists club_events_start_idx on public.club_events (starts_at);

alter table public.player_profile_details enable row level security;
alter table public.player_match_journal enable row level security;
alter table public.club_events enable row level security;

revoke all on public.player_profile_details, public.player_match_journal, public.club_events from anon;
grant select, insert, update, delete on public.player_profile_details, public.player_match_journal, public.club_events to authenticated;

drop policy if exists player_profile_details_select on public.player_profile_details;
create policy player_profile_details_select on public.player_profile_details
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or (is_coach() and exists (
      select 1 from public.coach_players cp
      where cp.coach_id = (select auth.uid()) and cp.player_id = player_profile_details.player_id
    ))
  );

drop policy if exists player_profile_details_insert on public.player_profile_details;
create policy player_profile_details_insert on public.player_profile_details
  for insert to authenticated
  with check (is_player() and player_id = (select auth.uid()));

drop policy if exists player_profile_details_update on public.player_profile_details;
create policy player_profile_details_update on public.player_profile_details
  for update to authenticated
  using (is_player() and player_id = (select auth.uid()))
  with check (is_player() and player_id = (select auth.uid()));

drop policy if exists player_profile_details_delete on public.player_profile_details;
create policy player_profile_details_delete on public.player_profile_details
  for delete to authenticated
  using (is_player() and player_id = (select auth.uid()));

drop policy if exists player_match_journal_select on public.player_match_journal;
create policy player_match_journal_select on public.player_match_journal
  for select to authenticated
  using (is_player() and player_id = (select auth.uid()));

drop policy if exists player_match_journal_insert on public.player_match_journal;
create policy player_match_journal_insert on public.player_match_journal
  for insert to authenticated
  with check (is_player() and player_id = (select auth.uid()));

drop policy if exists player_match_journal_update on public.player_match_journal;
create policy player_match_journal_update on public.player_match_journal
  for update to authenticated
  using (is_player() and player_id = (select auth.uid()))
  with check (is_player() and player_id = (select auth.uid()));

drop policy if exists player_match_journal_delete on public.player_match_journal;
create policy player_match_journal_delete on public.player_match_journal
  for delete to authenticated
  using (is_player() and player_id = (select auth.uid()));

drop policy if exists club_events_select_published on public.club_events;
create policy club_events_select_published on public.club_events
  for select to authenticated
  using (published = true or (is_coach() and created_by = (select auth.uid())));

drop policy if exists club_events_insert_coach on public.club_events;
create policy club_events_insert_coach on public.club_events
  for insert to authenticated
  with check (is_coach() and created_by = (select auth.uid()));

drop policy if exists club_events_update_coach on public.club_events;
create policy club_events_update_coach on public.club_events
  for update to authenticated
  using (is_coach() and created_by = (select auth.uid()))
  with check (is_coach() and created_by = (select auth.uid()));

drop policy if exists club_events_delete_coach on public.club_events;
create policy club_events_delete_coach on public.club_events
  for delete to authenticated
  using (is_coach() and created_by = (select auth.uid()));
