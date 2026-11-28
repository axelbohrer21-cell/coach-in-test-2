-- Use the private role helper in Storage policies.
-- The public helper is intentionally not executable by authenticated users.
drop policy if exists coach_in_videos_insert on storage.objects;
create policy coach_in_videos_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'coach-in-videos'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 3
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.coach_players cp
    join public.profiles c on c.id = cp.coach_id and c.role = 'coach' and c.archived_at is null
    join public.profiles p on p.id = cp.player_id and p.role = 'player' and p.archived_at is null
    where cp.coach_id = ((storage.foldername(name))[1])::uuid
      and cp.player_id = ((storage.foldername(name))[2])::uuid
      and cp.coach_id = (select auth.uid())
      and private.is_coach()
  )
);

drop policy if exists coach_in_videos_delete on storage.objects;
create policy coach_in_videos_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'coach-in-videos'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 3
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.coach_video_analyses a
    where a.coach_id = (select auth.uid())
      and a.coach_id = ((storage.foldername(name))[1])::uuid
      and a.player_id = ((storage.foldername(name))[2])::uuid
      and a.id = ((storage.foldername(name))[3])::uuid
      and private.is_coach()
  )
);