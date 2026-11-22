-- Favoris privés des séances individuelles du coach.
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
grant select, insert, delete on public.coach_session_favorites to authenticated;
create policy "Coach reads own session favorites"
on public.coach_session_favorites for select to authenticated
using (coach_id = (select auth.uid()) and private.is_coach());
create policy "Coach favorites own sessions"
on public.coach_session_favorites for insert to authenticated
with check (
  coach_id = (select auth.uid()) and private.is_coach()
  and exists (
    select 1 from public.training_sessions s
    join public.coach_players cp on cp.player_id = s.player_id
    where s.id = session_id and s.created_by = (select auth.uid())
      and cp.coach_id = (select auth.uid())
  )
);
create policy "Coach removes own session favorites"
on public.coach_session_favorites for delete to authenticated
using (
  coach_id = (select auth.uid()) and private.is_coach()
  and exists (
    select 1 from public.training_sessions s
    join public.coach_players cp on cp.player_id = s.player_id
    where s.id = session_id and s.created_by = (select auth.uid())
      and cp.coach_id = (select auth.uid())
  )
);