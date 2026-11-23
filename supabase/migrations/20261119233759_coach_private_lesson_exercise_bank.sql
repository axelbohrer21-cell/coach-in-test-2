-- Banque d'exercices personnelle, réservée aux cours particuliers.
create table if not exists public.coach_session_exercises (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  objective_id text,
  theme text not null,
  title text not null check (char_length(title) between 2 and 140),
  setup text not null default '',
  instructions text not null,
  success_criteria text not null,
  coaching_cue text not null default '',
  level text not null default 'Tous niveaux',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coach_session_exercises_owner_theme_idx
  on public.coach_session_exercises (coach_id, theme, objective_id, active);
alter table public.coach_session_exercises enable row level security;
revoke all on public.coach_session_exercises from anon;
grant select, insert, update, delete on public.coach_session_exercises to authenticated;

drop policy if exists "Coach reads own session exercises" on public.coach_session_exercises;
create policy "Coach reads own session exercises"
  on public.coach_session_exercises for select to authenticated
  using (coach_id = (select auth.uid()));

drop policy if exists "Coach inserts own session exercises" on public.coach_session_exercises;
create policy "Coach inserts own session exercises"
  on public.coach_session_exercises for insert to authenticated
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
  );

drop policy if exists "Coach updates own session exercises" on public.coach_session_exercises;
create policy "Coach updates own session exercises"
  on public.coach_session_exercises for update to authenticated
  using (coach_id = (select auth.uid()))
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
  );

drop policy if exists "Coach deletes own session exercises" on public.coach_session_exercises;
create policy "Coach deletes own session exercises"
  on public.coach_session_exercises for delete to authenticated
  using (
    coach_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
  );

comment on table public.coach_session_exercises is
  'Banque personnelle d’exercices tactiques pour les cours particuliers Coach In. Chaque coach ne voit et ne modifie que ses propres exercices.';