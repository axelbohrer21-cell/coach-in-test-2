
-- Active coach identity: archived coach sessions must not keep authorizing requests.
create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='coach' and p.archived_at is null
  );
$$;

-- A player already followed by a coach can only be shared through that coach's invitation.
create or replace function public.add_existing_player_to_coach(p_player_email text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_coach_id uuid:=auth.uid(); v_player_id uuid; v_email text:=lower(trim(coalesce(p_player_email,'')));
begin
 if v_coach_id is null or not public.is_coach() then raise exception 'Action réservée à un coach actif.'; end if;
 if v_email='' then raise exception 'Adresse e-mail manquante.'; end if;
 select p.id into v_player_id from public.profiles p
 where lower(p.email)=v_email and p.role='player' and p.archived_at is null limit 1;
 if v_player_id is null then raise exception 'Aucun compte joueur actif trouvé avec cette adresse.'; end if;
 if exists(select 1 from public.coach_players cp where cp.player_id=v_player_id and cp.coach_id<>v_coach_id) then
  raise exception 'Ce joueur est déjà suivi par un autre coach. Demande au coach référent de partager sa fiche.';
 end if;
 insert into public.coach_players(coach_id,player_id) values(v_coach_id,v_player_id) on conflict(coach_id,player_id) do nothing;
 return v_player_id;
end;
$$;

alter table public.coach_player_invitations add column if not exists invited_coach_email text;
update public.coach_player_invitations i set invited_coach_email=lower(p.email)
from public.profiles p where p.id=i.invited_coach_id and i.invited_coach_email is null;

create or replace function public.invite_coach_to_player(p_player_id uuid,p_coach_email text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_inviter uuid:=auth.uid(); v_invited uuid; v_email text:=lower(trim(coalesce(p_coach_email,''))); v_id uuid;
begin
 if v_inviter is null or not public.is_coach() then raise exception 'Action réservée à un coach actif.'; end if;
 if not exists(select 1 from public.coach_players where coach_id=v_inviter and player_id=p_player_id) then raise exception 'Tu dois déjà suivre ce joueur.'; end if;
 if v_email='' then raise exception 'Adresse e-mail manquante.'; end if;
 select p.id into v_invited from public.profiles p where lower(p.email)=v_email and p.role='coach' and p.archived_at is null;
 if v_invited is null then raise exception 'Aucun compte coach actif trouvé avec cette adresse.'; end if;
 if v_invited=v_inviter then raise exception 'Tu ne peux pas t’inviter toi-même.'; end if;
 if exists(select 1 from public.coach_players where coach_id=v_invited and player_id=p_player_id) then raise exception 'Ce coach a déjà accès à cette fiche.'; end if;
 insert into public.coach_player_invitations(player_id,inviter_coach_id,invited_coach_id,invited_coach_email)
 values(p_player_id,v_inviter,v_invited,v_email) returning id into v_id;
 return v_id;
exception when unique_violation then raise exception 'Une invitation est déjà en attente.';
end;
$$;

create or replace function public.respond_coach_player_invitation(p_invitation_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare v public.coach_player_invitations%rowtype;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Action réservée à un coach actif.'; end if;
 select * into v from public.coach_player_invitations where id=p_invitation_id for update;
 if not found or v.invited_coach_id<>auth.uid() then raise exception 'Invitation introuvable.'; end if;
 if v.status<>'pending' then raise exception 'Invitation déjà traitée.'; end if;
 if not exists(select 1 from public.coach_players where coach_id=v.inviter_coach_id and player_id=v.player_id) then
  raise exception 'Le partage a été retiré par le coach à l’origine de l’invitation.';
 end if;
 if not exists(select 1 from public.profiles where id=v.player_id and role='player' and archived_at is null) then
  raise exception 'Ce compte joueur n’est plus actif.';
 end if;
 if p_accept then
  insert into public.coach_players(coach_id,player_id) values(v.invited_coach_id,v.player_id) on conflict(coach_id,player_id) do nothing;
  update public.coach_player_invitations set status='accepted',responded_at=now() where id=p_invitation_id;
 else
  update public.coach_player_invitations set status='rejected',responded_at=now() where id=p_invitation_id;
 end if;
end;
$$;

create or replace function public.revoke_coach_player_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v public.coach_player_invitations%rowtype;
begin
 if auth.uid() is null or not public.is_coach() then raise exception 'Action réservée à un coach actif.'; end if;
 select * into v from public.coach_player_invitations where id=p_invitation_id for update;
 if not found or v.inviter_coach_id<>auth.uid() then raise exception 'Seul le coach à l’origine du partage peut le retirer.'; end if;
 if v.status not in ('pending','accepted') then raise exception 'Ce partage a déjà été clôturé.'; end if;
 if v.status='accepted' then delete from public.coach_players where coach_id=v.invited_coach_id and player_id=v.player_id; end if;
 update public.coach_player_invitations set status='revoked',revoked_at=now() where id=p_invitation_id;
end;
$$;

-- Coach-player links can only be created by controlled RPCs (initial association or accepted invite).
drop policy if exists coach_players_insert_own on public.coach_players;
drop policy if exists coach_players_delete_own on public.coach_players;
drop policy if exists coach_players_select_own on public.coach_players;
create policy coach_players_select_own on public.coach_players for select to authenticated
using ((coach_id=(select auth.uid()) and public.is_coach()) or player_id=(select auth.uid()));

drop policy if exists cpi_participants_select on public.coach_player_invitations;
create policy cpi_participants_select on public.coach_player_invitations for select to authenticated
using (public.is_coach() and (inviter_coach_id=(select auth.uid()) or invited_coach_id=(select auth.uid())));

drop policy if exists profiles_select_self_or_linked_player on public.profiles;
create policy profiles_select_self_or_linked_player on public.profiles for select to authenticated
using (
 id=(select auth.uid())
 or (role='player' and archived_at is null and exists(select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=profiles.id))
 or (role='coach' and archived_at is null and exists(select 1 from public.coach_players cp where cp.player_id=(select auth.uid()) and cp.coach_id=profiles.id))
);

-- Coaches can edit only linked player profiles, never promote or archive them.
drop policy if exists profiles_update_self_or_linked_player on public.profiles;
create policy profiles_update_self_or_linked_player on public.profiles for update to authenticated
using (public.is_coach() and role='player' and exists(select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=profiles.id))
with check (public.is_coach() and role='player' and is_admin=false and archived_at is null and exists(select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=profiles.id));

-- Only active coach/player participants can read or send messages in a current shared thread.
drop policy if exists messages_thread_read on public.coach_player_messages;
create policy messages_thread_read on public.coach_player_messages for select to authenticated
using (
 ((coach_id=(select auth.uid()) and public.is_coach())
  or (player_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='player' and p.archived_at is null)))
 and exists(select 1 from public.coach_players cp where cp.coach_id=coach_player_messages.coach_id and cp.player_id=coach_player_messages.player_id)
);
drop policy if exists messages_thread_insert on public.coach_player_messages;
create policy messages_thread_insert on public.coach_player_messages for insert to authenticated
with check (
 sender_id=(select auth.uid())
 and ((coach_id=(select auth.uid()) and public.is_coach())
  or (player_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='player' and p.archived_at is null)))
 and exists(select 1 from public.coach_players cp where cp.coach_id=coach_player_messages.coach_id and cp.player_id=coach_player_messages.player_id)
);
drop policy if exists messages_thread_update_read on public.coach_player_messages;

-- Player-facing views intentionally expose only player-visible columns; the base tables keep coach notes private.
create or replace view public.player_sessions with (security_invoker=false,security_barrier=true) as
select s.id,s.player_id,s.session_date,s.session_time,s.duration_minutes,s.theme,s.exercise_1,s.exercise_2,s.return_to_match,
 s.player_visible_summary,s.created_at,s.status,s.created_by,p.first_name as coach_first_name,p.last_name as coach_last_name
from public.training_sessions s left join public.profiles p on p.id=s.created_by
where s.player_id=auth.uid();

create or replace view public.player_evaluations with (security_invoker=false,security_barrier=true) as
select e.id,e.player_id,e.session_id,e.evaluated_at,e.score,e.technical_score,e.tactical_score,e.physical_score,e.mental_score,
 e.player_visible_comment,e.created_at,e.created_by,p.first_name as coach_first_name,p.last_name as coach_last_name
from public.evaluations e left join public.profiles p on p.id=e.created_by
where e.player_id=auth.uid();

grant select on public.player_sessions,public.player_evaluations to authenticated;
revoke all on public.player_sessions,public.player_evaluations from anon;

drop policy if exists evaluation_criteria_player_select on public.evaluation_criteria;
create policy evaluation_criteria_player_select on public.evaluation_criteria for select to authenticated
using (exists(select 1 from public.player_evaluations pe where pe.id=evaluation_criteria.evaluation_id));

-- Read receipts are updated only through this recipient-checked RPC, not arbitrary row updates.
create or replace function public.mark_coach_in_message_read(p_message_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_message public.coach_player_messages%rowtype;
begin
 if auth.uid() is null then raise exception 'Connexion requise.'; end if;
 select * into v_message from public.coach_player_messages where id=p_message_id for update;
 if not found then raise exception 'Message introuvable.'; end if;
 if auth.uid()=v_message.sender_id then raise exception 'Seul le destinataire peut marquer ce message comme lu.'; end if;
 if auth.uid()=v_message.coach_id and not public.is_coach() then raise exception 'Accès refusé.'; end if;
 if auth.uid()=v_message.player_id and not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='player' and p.archived_at is null) then raise exception 'Accès refusé.'; end if;
 if auth.uid() not in (v_message.coach_id,v_message.player_id) then raise exception 'Accès refusé.'; end if;
 if not exists(select 1 from public.coach_players cp where cp.coach_id=v_message.coach_id and cp.player_id=v_message.player_id) then raise exception 'Cette conversation n’est plus active.'; end if;
 update public.coach_player_messages set read_at=coalesce(read_at,now()) where id=p_message_id;
end;
$$;

revoke all on function public.is_coach() from public,anon;
grant execute on function public.is_coach() to authenticated;
revoke all on function public.add_existing_player_to_coach(text) from public,anon;
grant execute on function public.add_existing_player_to_coach(text) to authenticated;
revoke all on function public.invite_coach_to_player(uuid,text) from public,anon;
grant execute on function public.invite_coach_to_player(uuid,text) to authenticated;
revoke all on function public.respond_coach_player_invitation(uuid,boolean) from public,anon;
grant execute on function public.respond_coach_player_invitation(uuid,boolean) to authenticated;
revoke all on function public.revoke_coach_player_invitation(uuid) from public,anon;
grant execute on function public.revoke_coach_player_invitation(uuid) to authenticated;
revoke all on function public.mark_coach_in_message_read(uuid) from public,anon;
grant execute on function public.mark_coach_in_message_read(uuid) to authenticated;
revoke all on function public.notify_player_existing_evaluation(uuid) from public,anon;
grant execute on function public.notify_player_existing_evaluation(uuid) to authenticated;
revoke all on function public.notify_player_achievement_unlocked(uuid) from public,anon;
grant execute on function public.notify_player_achievement_unlocked(uuid) to authenticated;
revoke all on function public.notify_coach_in_message_event() from public,anon,authenticated;
revoke all on function public.notify_coach_in_progress_event() from public,anon,authenticated;
revoke all on function public.notify_coach_in_session_event() from public,anon,authenticated;
revoke all on function public.filter_coach_in_app_notification() from public,anon,authenticated;
