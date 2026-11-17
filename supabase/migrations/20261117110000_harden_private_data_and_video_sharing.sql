-- Coach In: tighten helper execution, storage access and player-visible video data.
-- This migration is intentionally additive and preserves all user records.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (select 1 from public.profiles p where p.id=(select auth.uid()) and (p.is_admin=true or p.role='admin') and p.archived_at is null);
$$;
create or replace function private.is_coach()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='coach' and p.archived_at is null);
$$;
create or replace function private.is_player()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='player' and p.archived_at is null);
$$;
create or replace function private.is_linked_player(p_player_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (select 1 from public.coach_players cp where cp.coach_id=(select auth.uid()) and cp.player_id=p_player_id);
$$;

do $$
declare r record; v_using text; v_check text; v_sql text;
begin
  for r in
    select schemaname, tablename, policyname, roles, cmd, permissive, qual, with_check
    from pg_policies where schemaname='public'
      and (coalesce(qual,'') ~* '(^|[^.[:alnum:]_])is_(admin|coach|player)\(\)'
        or coalesce(with_check,'') ~* '(^|[^.[:alnum:]_])is_(admin|coach|player)\(\)'
        or coalesce(qual,'') ilike '%is_linked_player(%'
        or coalesce(with_check,'') ilike '%is_linked_player(%')
  loop
    v_using:=r.qual; v_check:=r.with_check;
    if v_using is not null then
      v_using:=regexp_replace(v_using,'(^|[^.[:alnum:]_])is_admin\(\)','\1private.is_admin()','gi');
      v_using:=regexp_replace(v_using,'(^|[^.[:alnum:]_])is_coach\(\)','\1private.is_coach()','gi');
      v_using:=regexp_replace(v_using,'(^|[^.[:alnum:]_])is_player\(\)','\1private.is_player()','gi');
      v_using:=regexp_replace(v_using,'(^|[^.[:alnum:]_])is_linked_player\(','\1private.is_linked_player(','gi');
    end if;
    if v_check is not null then
      v_check:=regexp_replace(v_check,'(^|[^.[:alnum:]_])is_admin\(\)','\1private.is_admin()','gi');
      v_check:=regexp_replace(v_check,'(^|[^.[:alnum:]_])is_coach\(\)','\1private.is_coach()','gi');
      v_check:=regexp_replace(v_check,'(^|[^.[:alnum:]_])is_player\(\)','\1private.is_player()','gi');
      v_check:=regexp_replace(v_check,'(^|[^.[:alnum:]_])is_linked_player\(','\1private.is_linked_player(','gi');
    end if;
    execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
    v_sql:=format('create policy %I on %I.%I as %s for %s to %s',r.policyname,r.schemaname,r.tablename,r.permissive,r.cmd,array_to_string(r.roles,', '));
    if v_using is not null then v_sql:=v_sql||format(' using (%s)',v_using); end if;
    if v_check is not null then v_sql:=v_sql||format(' with check (%s)',v_check); end if;
    execute v_sql;
  end loop;
end $$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;

revoke all on function public.is_admin(),public.is_coach(),public.is_player(),public.is_linked_player(uuid) from public,anon,authenticated;
grant execute on function public.is_admin(),public.is_coach(),public.is_player(),public.is_linked_player(uuid) to service_role;

revoke execute on function public.add_existing_player_to_coach(text),public.cancel_private_booking(uuid),
 public.invite_coach_to_player(uuid,text),public.mark_coach_in_message_read(uuid),
 public.notify_player_achievement_unlocked(uuid),public.notify_player_existing_evaluation(uuid),
 public.request_private_booking(uuid,date,time without time zone,integer,smallint),
 public.respond_coach_player_invitation(uuid,boolean),public.review_private_booking(uuid,text,text),
 public.revoke_coach_player_invitation(uuid) from public,anon;
grant execute on function public.add_existing_player_to_coach(text),public.cancel_private_booking(uuid),
 public.invite_coach_to_player(uuid,text),public.mark_coach_in_message_read(uuid),
 public.notify_player_achievement_unlocked(uuid),public.notify_player_existing_evaluation(uuid),
 public.request_private_booking(uuid,date,time without time zone,integer,smallint),
 public.respond_coach_player_invitation(uuid,boolean),public.review_private_booking(uuid,text,text),
 public.revoke_coach_player_invitation(uuid) to authenticated,service_role;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke all on table storage.objects,storage.buckets from public,anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated,service_role;

drop policy if exists coach_video_analyses_select on public.coach_video_analyses;
create policy coach_video_analyses_select on public.coach_video_analyses for select to authenticated
using (coach_id=(select auth.uid()) and private.is_coach()
  and exists(select 1 from public.coach_players cp join public.profiles p on p.id=cp.player_id and p.role='player' and p.archived_at is null
    where cp.coach_id=coach_video_analyses.coach_id and cp.player_id=coach_video_analyses.player_id));

create or replace view public.player_video_analyses with (security_barrier=true) as
select a.id,a.player_id,a.title,a.stroke_type,a.video_path,a.video_mime,a.video_size_bytes,a.duration_seconds,
 a.status,a.analysis_result,a.confidence,a.shared_with_player,a.analyzed_at,a.created_at,a.updated_at
from public.coach_video_analyses a
where a.player_id=(select auth.uid()) and a.shared_with_player=true
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='player' and p.archived_at is null);
grant select on public.player_video_analyses to authenticated;
revoke all on public.player_video_analyses from public,anon;

drop policy if exists coach_in_videos_select on storage.objects;
create policy coach_in_videos_select on storage.objects for select to authenticated
using (bucket_id='coach-in-videos' and coalesce(array_length(storage.foldername(name),1),0)>=3
 and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and (exists(select 1 from public.coach_video_analyses a where a.id=((storage.foldername(name))[3])::uuid
      and a.coach_id=(select auth.uid()) and a.player_id=((storage.foldername(name))[2])::uuid and private.is_coach())
   or exists(select 1 from public.player_video_analyses a where a.id=((storage.foldername(name))[3])::uuid and a.player_id=(select auth.uid()))));

alter default privileges for role postgres in schema public
  revoke execute on functions from public,anon,authenticated,service_role;
