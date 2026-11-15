-- Coach In — isoler physiquement les notes privées et rendre les vues joueur invoker-safe.
-- Les notes restent visibles uniquement par leur coach auteur.
begin;

create table if not exists public.coach_session_notes (
  session_id uuid primary key references public.training_sessions(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.coach_session_notes enable row level security;
drop policy if exists coach_session_notes_owner_all on public.coach_session_notes;
create policy coach_session_notes_owner_all
on public.coach_session_notes for all to authenticated
using (
  coach_id = (select auth.uid())
  and public.is_coach()
  and exists (
    select 1 from public.training_sessions s
    join public.coach_players cp on cp.player_id = s.player_id
    where s.id = coach_session_notes.session_id
      and s.created_by = (select auth.uid())
      and cp.coach_id = (select auth.uid())
  )
)
with check (
  coach_id = (select auth.uid())
  and public.is_coach()
  and exists (
    select 1 from public.training_sessions s
    join public.coach_players cp on cp.player_id = s.player_id
    where s.id = coach_session_notes.session_id
      and s.created_by = (select auth.uid())
      and cp.coach_id = (select auth.uid())
  )
);

revoke all on public.coach_session_notes from anon;
grant select, insert, update, delete on public.coach_session_notes to authenticated;

-- Préserver d'éventuelles notes déjà saisies avant de retirer la colonne de la table partagée.
insert into public.coach_session_notes(session_id, coach_id, note)
select s.id, s.created_by, s.coach_private_notes
from public.training_sessions s
where nullif(pg_catalog.btrim(s.coach_private_notes), '') is not null
on conflict (session_id) do update
set note = excluded.note, coach_id = excluded.coach_id, updated_at = now();

alter table public.training_sessions drop column if exists coach_private_notes;

-- Les vues respectent désormais les RLS du compte appelant.
create or replace view public.player_sessions
with (security_invoker = true) as
select
  s.id, s.player_id, s.session_date, s.session_time, s.duration_minutes,
  s.theme, s.exercise_1, s.exercise_2, s.return_to_match,
  s.player_visible_summary, s.created_at, s.created_by,
  p.first_name as coach_first_name, p.last_name as coach_last_name
from public.training_sessions s
left join public.profiles p on p.id = s.created_by
where s.player_id = (select auth.uid());

create or replace view public.player_evaluations
with (security_invoker = true) as
select
  e.id, e.player_id, e.session_id, e.evaluated_at, e.score,
  e.technical_score, e.tactical_score, e.physical_score, e.mental_score,
  e.player_visible_comment, e.created_at, e.created_by,
  p.first_name as coach_first_name, p.last_name as coach_last_name
from public.evaluations e
left join public.profiles p on p.id = e.created_by
where e.player_id = (select auth.uid());

create or replace view public.player_evaluation_criteria
with (security_invoker = true) as
select
  ec.id, ec.evaluation_id, ec.criterion_id, ec.main_theme, ec.subtheme,
  ec.criterion, ec.criterion_type, ec.measured_value, ec.created_at
from public.evaluation_criteria ec
join public.evaluations e on e.id = ec.evaluation_id
where e.player_id = (select auth.uid());

grant select on public.player_sessions to authenticated;
grant select on public.player_evaluations to authenticated;
grant select on public.player_evaluation_criteria to authenticated;

commit;
