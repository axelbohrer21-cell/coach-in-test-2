-- Coach In: add private follow-up tracking for each AI video correction.
-- Safe to run on environments where the table already exists.
create table if not exists public.coach_video_correction_followups (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  analysis_id uuid not null references public.coach_video_analyses(id) on delete cascade,
  correction_index integer not null check (correction_index >= 0),
  evaluation_id uuid references public.evaluations(id) on delete set null,
  session_id uuid references public.training_sessions(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','in_progress','verified','not_achieved')),
  coach_observation text not null default '',
  correction_data jsonb not null default '{}'::jsonb,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_video_correction_followups_analysis_id_correction_index_key unique (analysis_id, correction_index)
);
comment on table public.coach_video_correction_followups is 'COACH IN — Suivi privé des corrections vidéo, accessible au coach propriétaire via RLS.';
create index if not exists coach_video_correction_followups_coach_player_idx on public.coach_video_correction_followups(coach_id,player_id,created_at desc);
alter table public.coach_video_correction_followups enable row level security;
drop policy if exists "Coach manages own video correction followups" on public.coach_video_correction_followups;
create policy "Coach manages own video correction followups"
on public.coach_video_correction_followups for all to authenticated
using (
  coach_id=(select auth.uid())
  and exists (select 1 from public.coach_video_analyses a
    where a.id=coach_video_correction_followups.analysis_id
      and a.coach_id=(select auth.uid())
      and a.player_id=coach_video_correction_followups.player_id)
  and exists (select 1 from public.coach_players cp
    where cp.coach_id=(select auth.uid())
      and cp.player_id=coach_video_correction_followups.player_id)
)
with check (
  coach_id=(select auth.uid())
  and exists (select 1 from public.coach_video_analyses a
    where a.id=coach_video_correction_followups.analysis_id
      and a.coach_id=(select auth.uid())
      and a.player_id=coach_video_correction_followups.player_id)
  and exists (select 1 from public.coach_players cp
    where cp.coach_id=(select auth.uid())
      and cp.player_id=coach_video_correction_followups.player_id)
  and (evaluation_id is null or exists (select 1 from public.evaluations e
    where e.id=coach_video_correction_followups.evaluation_id
      and e.player_id=coach_video_correction_followups.player_id
      and e.created_by=(select auth.uid())))
  and (session_id is null or exists (select 1 from public.training_sessions s
    where s.id=coach_video_correction_followups.session_id
      and s.player_id=coach_video_correction_followups.player_id
      and s.created_by=(select auth.uid())))
);
