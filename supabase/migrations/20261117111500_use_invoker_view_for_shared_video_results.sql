drop policy if exists coach_in_videos_select on storage.objects;
drop view if exists public.player_video_analyses;

create or replace function private.get_player_video_analyses()
returns table (
 id uuid, player_id uuid, title text, stroke_type text, video_path text,
 video_mime text, video_size_bytes bigint, duration_seconds numeric,
 status text, analysis_result jsonb, confidence text, shared_with_player boolean,
 analyzed_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path=''
as $$
 select a.id,a.player_id,a.title,a.stroke_type,a.video_path,a.video_mime,
        a.video_size_bytes,a.duration_seconds,a.status,a.analysis_result,
        a.confidence,a.shared_with_player,a.analyzed_at,a.created_at,a.updated_at
 from public.coach_video_analyses a
 where a.player_id=(select auth.uid())
   and a.shared_with_player=true
   and exists (select 1 from public.profiles p
     where p.id=(select auth.uid()) and p.role='player' and p.archived_at is null);
$$;
revoke all on function private.get_player_video_analyses() from public,anon;
grant execute on function private.get_player_video_analyses() to authenticated;

create view public.player_video_analyses
with (security_invoker=true,security_barrier=true) as
select id,player_id,title,stroke_type,video_path,video_mime,video_size_bytes,
       duration_seconds::numeric(8,2) as duration_seconds,status,analysis_result,
       confidence,shared_with_player,analyzed_at,created_at,updated_at
from private.get_player_video_analyses();
grant select on public.player_video_analyses to authenticated;
revoke all on public.player_video_analyses from public,anon;

create policy coach_in_videos_select on storage.objects for select to authenticated
using (
 bucket_id='coach-in-videos'
 and coalesce(array_length(storage.foldername(name),1),0)>=3
 and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and (
  exists(select 1 from public.coach_video_analyses a
    where a.id=((storage.foldername(name))[3])::uuid
      and a.coach_id=(select auth.uid())
      and a.player_id=((storage.foldername(name))[2])::uuid
      and private.is_coach())
  or exists(select 1 from public.player_video_analyses a
    where a.id=((storage.foldername(name))[3])::uuid and a.player_id=(select auth.uid()))
 )
);