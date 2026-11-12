-- Coach In — partage complet des dossiers joueurs entre coachs.
-- Migration additive à tester sur une copie Supabase. Ne pas exécuter en production sans sauvegarde.

create extension if not exists pgcrypto;

create table if not exists public.coach_player_invitations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  inviter_coach_id uuid not null references public.profiles(id) on delete cascade,
  invited_coach_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','revoked')),
  created_at timestamptz not null default now(), responded_at timestamptz, revoked_at timestamptz,
  check (inviter_coach_id <> invited_coach_id)
);
create unique index if not exists idx_cpi_pending on public.coach_player_invitations(player_id,inviter_coach_id,invited_coach_id) where status='pending';
create index if not exists idx_cpi_inbox on public.coach_player_invitations(invited_coach_id,created_at desc);
alter table public.coach_player_invitations enable row level security;
drop policy if exists cpi_participants_select on public.coach_player_invitations;
create policy cpi_participants_select on public.coach_player_invitations for select to authenticated
using (inviter_coach_id=auth.uid() or invited_coach_id=auth.uid());
revoke insert,update,delete on public.coach_player_invitations from authenticated;
grant select on public.coach_player_invitations to authenticated;

create or replace function public.invite_coach_to_player(p_player_id uuid,p_coach_email text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_inviter uuid:=auth.uid(); v_invited uuid; v_id uuid;
begin
 if v_inviter is null or not public.is_coach() then raise exception 'Action réservée à un coach.'; end if;
 if not exists(select 1 from public.coach_players where coach_id=v_inviter and player_id=p_player_id) then raise exception 'Tu dois déjà suivre ce joueur.'; end if;
 select u.id into v_invited from auth.users u join public.profiles p on p.id=u.id
 where lower(u.email)=lower(trim(p_coach_email)) and p.role='coach';
 if v_invited is null then raise exception 'Aucun compte coach trouvé avec cette adresse.'; end if;
 if v_invited=v_inviter then raise exception 'Tu ne peux pas t’inviter toi-même.'; end if;
 if exists(select 1 from public.coach_players where coach_id=v_invited and player_id=p_player_id) then raise exception 'Ce coach a déjà accès à cette fiche.'; end if;
 insert into public.coach_player_invitations(player_id,inviter_coach_id,invited_coach_id)
 values(p_player_id,v_inviter,v_invited) returning id into v_id; return v_id;
exception when unique_violation then raise exception 'Une invitation est déjà en attente.';
end; $$;

create or replace function public.respond_coach_player_invitation(p_invitation_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v public.coach_player_invitations%rowtype;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Action réservée à un coach.'; end if;
 select * into v from public.coach_player_invitations where id=p_invitation_id for update;
 if not found or v.invited_coach_id<>auth.uid() then raise exception 'Invitation introuvable.'; end if;
 if v.status<>'pending' then raise exception 'Invitation déjà traitée.'; end if;
 if p_accept then
  insert into public.coach_players(coach_id,player_id) values(v.invited_coach_id,v.player_id) on conflict(coach_id,player_id) do nothing;
  update public.coach_player_invitations set status='accepted',responded_at=now() where id=p_invitation_id;
 else update public.coach_player_invitations set status='rejected',responded_at=now() where id=p_invitation_id; end if;
end; $$;

create or replace function public.revoke_coach_player_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.coach_player_invitations%rowtype;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Action réservée à un coach.'; end if;
 select * into v from public.coach_player_invitations where id=p_invitation_id for update;
 if not found or v.inviter_coach_id<>auth.uid() then raise exception 'Seul le coach initiateur peut révoquer ce partage.'; end if;
 if v.status<>'accepted' then raise exception 'Ce partage n’est pas actif.'; end if;
 update public.coach_player_invitations set status='revoked',revoked_at=now() where id=p_invitation_id;
 delete from public.coach_players where coach_id=v.invited_coach_id and player_id=v.player_id;
end; $$;
revoke all on function public.invite_coach_to_player(uuid,text) from public;
revoke all on function public.respond_coach_player_invitation(uuid,boolean) from public;
revoke all on function public.revoke_coach_player_invitation(uuid) from public;
grant execute on function public.invite_coach_to_player(uuid,text) to authenticated;
grant execute on function public.respond_coach_player_invitation(uuid,boolean) to authenticated;
grant execute on function public.revoke_coach_player_invitation(uuid) to authenticated;

-- Remplace les anciennes politiques trop larges (tout coach voyait tous les joueurs).
drop policy if exists profiles_select_own_or_coach on public.profiles;
drop policy if exists profiles_update_coach_only on public.profiles;
drop policy if exists profiles_update_own_or_coach on public.profiles;
drop policy if exists profiles_select_self_or_linked_player on public.profiles;
create policy profiles_select_self_or_linked_player on public.profiles for select to authenticated
using(id=auth.uid() or exists(select 1 from public.coach_players cp where cp.coach_id=auth.uid() and cp.player_id=profiles.id)
 or exists(select 1 from public.coach_players cp where cp.player_id=auth.uid() and cp.coach_id=profiles.id));
drop policy if exists profiles_update_self_or_linked_player on public.profiles;
create policy profiles_update_self_or_linked_player on public.profiles for update to authenticated
using(public.is_coach() and exists(select 1 from public.coach_players cp where cp.coach_id=auth.uid() and cp.player_id=profiles.id))
with check(public.is_coach() and exists(select 1 from public.coach_players cp where cp.coach_id=auth.uid() and cp.player_id=profiles.id));

-- Historique partagé : tous les coachs associés au joueur peuvent le lire et l'enrichir.
drop policy if exists sessions_select_coach_only on public.training_sessions;
drop policy if exists sessions_coach_insert on public.training_sessions;
drop policy if exists sessions_coach_update on public.training_sessions;
drop policy if exists sessions_coach_delete on public.training_sessions;
drop policy if exists training_sessions_shared_select on public.training_sessions;
drop policy if exists training_sessions_shared_insert on public.training_sessions;
drop policy if exists training_sessions_shared_update on public.training_sessions;
drop policy if exists training_sessions_shared_delete on public.training_sessions;
create policy training_sessions_shared_select on public.training_sessions for select to authenticated
using(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=training_sessions.player_id and cp.coach_id=auth.uid()));
create policy training_sessions_shared_insert on public.training_sessions for insert to authenticated
with check(public.is_coach() and created_by=auth.uid() and exists(select 1 from public.coach_players cp where cp.player_id=training_sessions.player_id and cp.coach_id=auth.uid()));
create policy training_sessions_shared_update on public.training_sessions for update to authenticated
using(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=training_sessions.player_id and cp.coach_id=auth.uid()))
with check(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=training_sessions.player_id and cp.coach_id=auth.uid()));
create policy training_sessions_shared_delete on public.training_sessions for delete to authenticated
using(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=training_sessions.player_id and cp.coach_id=auth.uid()));

drop policy if exists evaluations_coach_all on public.evaluations;
drop policy if exists evaluations_shared_all on public.evaluations;
drop policy if exists evaluations_shared_select on public.evaluations;
drop policy if exists evaluations_shared_insert on public.evaluations;
drop policy if exists evaluations_shared_update on public.evaluations;
drop policy if exists evaluations_shared_delete on public.evaluations;
create policy evaluations_shared_select on public.evaluations for select to authenticated
using(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=evaluations.player_id and cp.coach_id=auth.uid()));
create policy evaluations_shared_insert on public.evaluations for insert to authenticated
with check(public.is_coach() and created_by=auth.uid() and exists(select 1 from public.coach_players cp where cp.player_id=evaluations.player_id and cp.coach_id=auth.uid()));
create policy evaluations_shared_update on public.evaluations for update to authenticated
using(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=evaluations.player_id and cp.coach_id=auth.uid()))
with check(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=evaluations.player_id and cp.coach_id=auth.uid()));
create policy evaluations_shared_delete on public.evaluations for delete to authenticated
using(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=evaluations.player_id and cp.coach_id=auth.uid()));
drop policy if exists evaluation_criteria_coach_all on public.evaluation_criteria;
drop policy if exists evaluation_criteria_shared_all on public.evaluation_criteria;
create policy evaluation_criteria_shared_all on public.evaluation_criteria for all to authenticated
using(exists(select 1 from public.evaluations e join public.coach_players cp on cp.player_id=e.player_id where e.id=evaluation_criteria.evaluation_id and cp.coach_id=auth.uid() and public.is_coach()))
with check(exists(select 1 from public.evaluations e join public.coach_players cp on cp.player_id=e.player_id where e.id=evaluation_criteria.evaluation_id and cp.coach_id=auth.uid() and public.is_coach()));

drop policy if exists challenges_coach_all on public.player_challenges;
drop policy if exists player_challenges_owner_all on public.player_challenges;
drop policy if exists achievements_coach_all on public.player_achievements;
drop policy if exists player_achievements_owner_all on public.player_achievements;
drop policy if exists player_challenges_shared_all on public.player_challenges;
drop policy if exists player_achievements_shared_all on public.player_achievements;
create policy player_challenges_shared_all on public.player_challenges for all to authenticated
using(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=player_challenges.player_id and cp.coach_id=auth.uid()))
with check(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=player_challenges.player_id and cp.coach_id=auth.uid()));
create policy player_achievements_shared_all on public.player_achievements for all to authenticated
using(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=player_achievements.player_id and cp.coach_id=auth.uid()))
with check(public.is_coach() and exists(select 1 from public.coach_players cp where cp.player_id=player_achievements.player_id and cp.coach_id=auth.uid()));

-- Réservation avec choix explicite du coach, au lieu du premier coach trouvé.
drop function if exists public.request_private_booking(date,time,integer,smallint);
create or replace function public.request_private_booking(p_coach_id uuid,p_session_date date,p_start_time time,p_duration_minutes integer,p_court_number smallint)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_player uuid:=auth.uid(); v_id uuid; v_start timestamp; v_end timestamp;
begin
 if v_player is null then raise exception 'Connexion requise.'; end if;
 if not exists(select 1 from public.profiles where id=p_coach_id and role='coach') then raise exception 'Coach invalide.'; end if;
 if not exists(select 1 from public.coach_players where coach_id=p_coach_id and player_id=v_player) then raise exception 'Ce coach ne suit pas ce joueur.'; end if;
 if p_duration_minutes not in(60,90,120) then raise exception 'Durée non autorisée.'; end if;
 if p_court_number not between 1 and 4 then raise exception 'Court invalide.'; end if;
 v_start:=p_session_date+p_start_time; v_end:=v_start+make_interval(mins=>p_duration_minutes);
 if v_start<=now() then raise exception 'Le créneau doit être dans le futur.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_coach_id::text||p_session_date::text||p_court_number::text,0));
 if exists(select 1 from public.booking_requests b where b.coach_id=p_coach_id and b.session_date=p_session_date and b.court_number=p_court_number and b.status in('pending','accepted') and (b.session_date+b.start_time)<v_end and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>v_start) then raise exception 'Ce créneau est déjà demandé ou réservé.'; end if;
 if exists(select 1 from public.training_sessions s where s.created_by=p_coach_id and s.session_date=p_session_date and coalesce(s.court_number,p_court_number)=p_court_number and (s.session_date+coalesce(s.session_time,time '00:00'))<v_end and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60)))>v_start) then raise exception 'Le coach a déjà une séance sur ce créneau.'; end if;
 if exists(select 1 from public.group_sessions g where g.coach_id=p_coach_id and g.session_date=p_session_date and g.court_number=p_court_number and g.status<>'cancelled' and (g.session_date+g.start_time)<v_end and (g.session_date+g.end_time)>v_start) then raise exception 'Un cours collectif occupe ce court.'; end if;
 insert into public.booking_requests(coach_id,player_id,session_date,start_time,duration_minutes,court_number,status) values(p_coach_id,v_player,p_session_date,p_start_time,p_duration_minutes,p_court_number,'pending') returning id into v_id;
 insert into public.coach_notifications(coach_id,player_id,notification_type,title,body,target_path) values(p_coach_id,v_player,'booking_request','Nouvelle demande de cours','Une demande de cours particulier attend ta réponse.','bookings');
 return v_id;
end; $$;
revoke all on function public.request_private_booking(uuid,date,time,integer,smallint) from public;
grant execute on function public.request_private_booking(uuid,date,time,integer,smallint) to authenticated;

comment on table public.coach_player_invitations is 'Invitations de partage complet de dossier joueur entre coachs. Une invitation en attente ne donne aucun accès.';


-- Les joueurs lisent uniquement les colonnes publiables via ces vues sécurisées.
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

create or replace view public.player_evaluation_criteria with (security_invoker=false) as
select ec.id,ec.evaluation_id,ec.criterion_id,ec.main_theme,ec.subtheme,ec.criterion,
       ec.criterion_type,ec.measured_value,ec.created_at
from public.evaluation_criteria ec join public.evaluations e on e.id=ec.evaluation_id
where e.player_id=(select auth.uid());
grant select on public.player_evaluation_criteria to authenticated;


-- Empêche de réattribuer rétroactivement une séance ou une évaluation à un autre auteur.
create or replace function public.keep_tracking_author()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.created_by is distinct from old.created_by and current_user not in ('postgres','service_role') then
    raise exception 'L’auteur d’un élément de suivi ne peut pas être modifié.';
  end if;
  return new;
end; $$;
drop trigger if exists training_sessions_keep_author on public.training_sessions;
create trigger training_sessions_keep_author before update on public.training_sessions
for each row execute function public.keep_tracking_author();
drop trigger if exists evaluations_keep_author on public.evaluations;
create trigger evaluations_keep_author before update on public.evaluations
for each row execute function public.keep_tracking_author();


-- Boîte de réception limitée au coach destinataire, sans ouvrir la fiche avant acceptation.
create or replace view public.coach_player_invitation_inbox with (security_invoker=false) as
select i.id,i.player_id,i.inviter_coach_id,i.status,i.created_at,
       p.first_name as player_first_name,p.last_name as player_last_name,
       c.first_name as inviter_first_name,c.last_name as inviter_last_name
from public.coach_player_invitations i
join public.profiles p on p.id=i.player_id
join public.profiles c on c.id=i.inviter_coach_id
where i.invited_coach_id=(select auth.uid()) and i.status='pending';
grant select on public.coach_player_invitation_inbox to authenticated;
