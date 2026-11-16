
-- A player can message only active coaches; suspended coaches keep their historical data but lose live access.
drop policy if exists messages_thread_read on public.coach_player_messages;
create policy messages_thread_read on public.coach_player_messages for select to authenticated
using (
 ((coach_id=(select auth.uid()) and public.is_coach())
  or (player_id=(select auth.uid())
      and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='player' and p.archived_at is null)
      and exists(select 1 from public.profiles c where c.id=coach_player_messages.coach_id and c.role='coach' and c.archived_at is null)))
 and exists(select 1 from public.coach_players cp where cp.coach_id=coach_player_messages.coach_id and cp.player_id=coach_player_messages.player_id)
);

drop policy if exists messages_thread_insert on public.coach_player_messages;
create policy messages_thread_insert on public.coach_player_messages for insert to authenticated
with check (
 sender_id=(select auth.uid())
 and ((coach_id=(select auth.uid()) and public.is_coach())
  or (player_id=(select auth.uid())
      and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='player' and p.archived_at is null)
      and exists(select 1 from public.profiles c where c.id=coach_player_messages.coach_id and c.role='coach' and c.archived_at is null)))
 and exists(select 1 from public.coach_players cp where cp.coach_id=coach_player_messages.coach_id and cp.player_id=coach_player_messages.player_id)
);

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
   not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='player' and p.archived_at is null)
   or not exists(select 1 from public.profiles c where c.id=v_message.coach_id and c.role='coach' and c.archived_at is null)
 ) then raise exception 'Accès refusé.'; end if;
 if auth.uid() not in (v_message.coach_id,v_message.player_id) then raise exception 'Accès refusé.'; end if;
 if not exists(select 1 from public.coach_players cp where cp.coach_id=v_message.coach_id and cp.player_id=v_message.player_id) then raise exception 'Cette conversation n’est plus active.'; end if;
 update public.coach_player_messages set read_at=coalesce(read_at,now()) where id=p_message_id;
end;
$$;
