-- Coach In — suivis pédagogiques séparés par coach
-- Migration additive. À appliquer après sauvegarde et vérification du projet.
-- Chaque joueur conserve une fiche unique, mais les coachs ne voient que leurs propres suivis.
-- Le joueur conserve l'accès à l'ensemble de ses suivis via les vues dédiées.

begin;

alter table public.training_sessions
  add column if not exists coach_private_notes text not null default '';

-- Les coachs ne voient et ne modifient que les séances qu'ils ont créées.
drop policy if exists training_sessions_shared_select on public.training_sessions;
drop policy if exists training_sessions_shared_insert on public.training_sessions;
drop policy if exists training_sessions_shared_update on public.training_sessions;
drop policy if exists training_sessions_shared_delete on public.training_sessions;

create policy training_sessions_coach_own_select
on public.training_sessions for select to authenticated
using (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = training_sessions.player_id
  )
);

create policy training_sessions_coach_own_insert
on public.training_sessions for insert to authenticated
with check (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = training_sessions.player_id
  )
);

create policy training_sessions_coach_own_update
on public.training_sessions for update to authenticated
using (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = training_sessions.player_id
  )
)
with check (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = training_sessions.player_id
  )
);

create policy training_sessions_coach_own_delete
on public.training_sessions for delete to authenticated
using (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = training_sessions.player_id
  )
);

-- Même séparation pour les bilans.
drop policy if exists evaluations_shared_select on public.evaluations;
drop policy if exists evaluations_shared_insert on public.evaluations;
drop policy if exists evaluations_shared_update on public.evaluations;
drop policy if exists evaluations_shared_delete on public.evaluations;

create policy evaluations_coach_own_select
on public.evaluations for select to authenticated
using (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = evaluations.player_id
  )
);

create policy evaluations_coach_own_insert
on public.evaluations for insert to authenticated
with check (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = evaluations.player_id
  )
);

create policy evaluations_coach_own_update
on public.evaluations for update to authenticated
using (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = evaluations.player_id
  )
)
with check (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = evaluations.player_id
  )
);

create policy evaluations_coach_own_delete
on public.evaluations for delete to authenticated
using (
  public.is_coach()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = evaluations.player_id
  )
);

-- Les critères suivent strictement les droits du bilan parent.
drop policy if exists evaluation_criteria_shared_all on public.evaluation_criteria;
create policy evaluation_criteria_coach_own_all
on public.evaluation_criteria for all to authenticated
using (
  public.is_coach()
  and exists (
    select 1 from public.evaluations e
    join public.coach_players cp on cp.player_id = e.player_id
    where e.id = evaluation_criteria.evaluation_id
      and e.created_by = (select auth.uid())
      and cp.coach_id = (select auth.uid())
  )
)
with check (
  public.is_coach()
  and exists (
    select 1 from public.evaluations e
    join public.coach_players cp on cp.player_id = e.player_id
    where e.id = evaluation_criteria.evaluation_id
      and e.created_by = (select auth.uid())
      and cp.coach_id = (select auth.uid())
  )
);

-- Défis et réussites : un ensemble distinct par couple joueur / coach.
drop policy if exists player_challenges_shared_all on public.player_challenges;
drop policy if exists player_achievements_shared_all on public.player_achievements;

create policy player_challenges_coach_own_all
on public.player_challenges for all to authenticated
using (
  public.is_coach()
  and coach_id = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = player_challenges.player_id
  )
)
with check (
  public.is_coach()
  and coach_id = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = player_challenges.player_id
  )
);

create policy player_achievements_coach_own_all
on public.player_achievements for all to authenticated
using (
  public.is_coach()
  and coach_id = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = player_achievements.player_id
  )
)
with check (
  public.is_coach()
  and coach_id = (select auth.uid())
  and exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid())
      and cp.player_id = player_achievements.player_id
  )
);

-- Autoriser un défi actif et une réussite par critère pour chaque coach séparément.
drop index if exists public.idx_one_active_challenge_per_player;
create unique index if not exists idx_one_active_challenge_per_player_coach
  on public.player_challenges(player_id, coach_id)
  where status = 'active';

drop index if exists public.idx_player_achievements_player_criterion_id;
create unique index if not exists idx_player_achievements_player_coach_criterion
  on public.player_achievements(player_id, coach_id, criterion_id)
  where criterion_id is not null;

-- Les vues joueur exposent les suivis de tous ses coachs, avec leur auteur,
-- sans jamais exposer coach_private_notes.
create or replace view public.player_sessions
with (security_invoker = false) as
select
  s.id, s.player_id, s.session_date, s.session_time, s.duration_minutes,
  s.theme, s.exercise_1, s.exercise_2, s.return_to_match,
  s.player_visible_summary, s.created_at, s.created_by,
  p.first_name as coach_first_name, p.last_name as coach_last_name
from public.training_sessions s
left join public.profiles p on p.id = s.created_by
where s.player_id = (select auth.uid());

create or replace view public.player_evaluations
with (security_invoker = false) as
select
  e.id, e.player_id, e.session_id, e.evaluated_at, e.score,
  e.technical_score, e.tactical_score, e.physical_score, e.mental_score,
  e.player_visible_comment, e.created_at, e.created_by,
  p.first_name as coach_first_name, p.last_name as coach_last_name
from public.evaluations e
left join public.profiles p on p.id = e.created_by
where e.player_id = (select auth.uid());

grant select on public.player_sessions to authenticated;
grant select on public.player_evaluations to authenticated;

-- Partage d'un bilan existant : uniquement par le coach auteur du bilan.
create or replace function public.notify_player_existing_evaluation(p_evaluation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_evaluated_at timestamptz;
begin
  if auth.uid() is null or not public.is_coach() then
    raise exception 'Action réservée à un coach.';
  end if;

  select e.player_id, e.evaluated_at
    into v_player_id, v_evaluated_at
  from public.evaluations e
  join public.coach_players cp
    on cp.player_id = e.player_id
   and cp.coach_id = auth.uid()
  where e.id = p_evaluation_id
    and e.created_by = auth.uid();

  if v_player_id is null then
    raise exception 'Bilan introuvable ou non créé par ce coach.';
  end if;

  insert into public.player_notifications (
    player_id, notification_type, title, body, target_path
  )
  values (
    v_player_id,
    'evaluation_shared',
    'Ton bilan est disponible !',
    'Ton coach vient de te partager un bilan du ' ||
      pg_catalog.to_char(v_evaluated_at at time zone 'Europe/Paris', 'DD/MM/YYYY') ||
      '. Consulte ton parcours pour le découvrir.',
    'reports'
  );
end;
$$;

revoke all on function public.notify_player_existing_evaluation(uuid) from public;
revoke all on function public.notify_player_existing_evaluation(uuid) from anon;
grant execute on function public.notify_player_existing_evaluation(uuid) to authenticated;

commit;
