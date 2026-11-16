
-- Player-safe invoker views and explicit column-level protection for confidential evaluation notes.
create or replace function public.is_player()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='player' and p.archived_at is null);
$$;
revoke all on function public.is_player() from public,anon;
grant execute on function public.is_player() to authenticated;

alter view public.player_sessions set (security_invoker=true,security_barrier=true);
grant select on public.player_sessions to authenticated;
revoke all on public.player_sessions from anon;

revoke select on public.evaluations from anon,authenticated;
revoke select (coach_private_notes) on public.evaluations from anon,authenticated;
grant select (id,player_id,session_id,evaluated_at,score,technical_score,tactical_score,physical_score,mental_score,player_visible_comment,created_by,created_at)
on public.evaluations to authenticated;

drop policy if exists training_sessions_coach_own_select on public.training_sessions;
drop policy if exists training_sessions_coach_or_player_select on public.training_sessions;
create policy training_sessions_coach_or_player_select on public.training_sessions for select to authenticated
using (
 (public.is_coach() and created_by=(select auth.uid())
  and exists(select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=training_sessions.player_id))
 or (player_id=(select auth.uid()) and public.is_player())
);

drop policy if exists evaluations_coach_own_select on public.evaluations;
drop policy if exists evaluations_coach_or_player_select on public.evaluations;
create policy evaluations_coach_or_player_select on public.evaluations for select to authenticated
using (
 (public.is_coach() and created_by=(select auth.uid())
  and exists(select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=evaluations.player_id))
 or (player_id=(select auth.uid()) and public.is_player())
);

alter view public.player_evaluations set (security_invoker=true,security_barrier=true);
grant select on public.player_evaluations to authenticated;
revoke all on public.player_evaluations from anon;

drop policy if exists profiles_select_self_or_linked_player on public.profiles;
create policy profiles_select_self_or_linked_player on public.profiles for select to authenticated
using (
 id=(select auth.uid())
 or (role='player' and archived_at is null and exists(select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=profiles.id))
 or (role='coach' and (
   exists(select 1 from public.coach_players cp where cp.player_id=(select auth.uid()) and cp.coach_id=profiles.id)
   or exists(select 1 from public.training_sessions s where s.player_id=(select auth.uid()) and s.created_by=profiles.id)
   or exists(select 1 from public.evaluations e where e.player_id=(select auth.uid()) and e.created_by=profiles.id)
 ))
);

drop policy if exists coach_players_select_own on public.coach_players;
create policy coach_players_select_own on public.coach_players for select to authenticated
using ((coach_id=(select auth.uid()) and public.is_coach()) or (player_id=(select auth.uid()) and public.is_player()));

drop policy if exists messages_thread_read on public.coach_player_messages;
create policy messages_thread_read on public.coach_player_messages for select to authenticated
using (
 ((coach_id=(select auth.uid()) and public.is_coach())
  or (player_id=(select auth.uid()) and public.is_player()
      and exists(select 1 from public.profiles c where c.id=coach_player_messages.coach_id and c.role='coach' and c.archived_at is null)))
 and exists(select 1 from public.coach_players cp where cp.coach_id=coach_player_messages.coach_id and cp.player_id=coach_player_messages.player_id)
);

drop policy if exists messages_thread_insert on public.coach_player_messages;
create policy messages_thread_insert on public.coach_player_messages for insert to authenticated
with check (
 sender_id=(select auth.uid())
 and ((coach_id=(select auth.uid()) and public.is_coach())
  or (player_id=(select auth.uid()) and public.is_player()
      and exists(select 1 from public.profiles c where c.id=coach_player_messages.coach_id and c.role='coach' and c.archived_at is null)))
 and exists(select 1 from public.coach_players cp where cp.coach_id=coach_player_messages.coach_id and cp.player_id=coach_player_messages.player_id)
);

drop policy if exists messages_thread_update_read on public.coach_player_messages;

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
 if auth.uid()=v_message.player_id and (
   not public.is_player()
   or not exists(select 1 from public.profiles c where c.id=v_message.coach_id and c.role='coach' and c.archived_at is null)
 ) then raise exception 'Accès refusé.'; end if;
 if auth.uid() not in (v_message.coach_id,v_message.player_id) then raise exception 'Accès refusé.'; end if;
 if not exists(select 1 from public.coach_players cp where cp.coach_id=v_message.coach_id and cp.player_id=v_message.player_id) then raise exception 'Cette conversation n’est plus active.'; end if;
 update public.coach_player_messages set read_at=coalesce(read_at,now()) where id=p_message_id;
end;
$$;
revoke all on function public.mark_coach_in_message_read(uuid) from public,anon;
grant execute on function public.mark_coach_in_message_read(uuid) to authenticated;
