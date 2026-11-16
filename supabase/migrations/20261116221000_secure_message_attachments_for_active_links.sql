drop policy if exists coach_in_message_files_read on storage.objects;
drop policy if exists coach_in_message_files_insert on storage.objects;
create policy coach_in_message_files_read
on storage.objects for select to authenticated
using (case
 when bucket_id <> 'coach-in-attachments' then false
 when coalesce(array_length(storage.foldername(name),1),0) < 2 then false
 when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 when (storage.foldername(name))[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 else exists (
   select 1
   from public.coach_players cp
   join public.profiles c on c.id=cp.coach_id and c.role='coach' and c.archived_at is null
   join public.profiles p on p.id=cp.player_id and p.role='player' and p.archived_at is null
   where cp.coach_id=((storage.foldername(name))[1])::uuid
     and cp.player_id=((storage.foldername(name))[2])::uuid
     and ((auth.uid()=cp.coach_id and public.is_coach())
       or (auth.uid()=cp.player_id and public.is_player()))
 )
end);
create policy coach_in_message_files_insert
on storage.objects for insert to authenticated
with check (case
 when bucket_id <> 'coach-in-attachments' then false
 when coalesce(array_length(storage.foldername(name),1),0) < 2 then false
 when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 when (storage.foldername(name))[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 else exists (
   select 1
   from public.coach_players cp
   join public.profiles c on c.id=cp.coach_id and c.role='coach' and c.archived_at is null
   join public.profiles p on p.id=cp.player_id and p.role='player' and p.archived_at is null
   where cp.coach_id=((storage.foldername(name))[1])::uuid
     and cp.player_id=((storage.foldername(name))[2])::uuid
     and ((auth.uid()=cp.coach_id and public.is_coach())
       or (auth.uid()=cp.player_id and public.is_player()))
 )
end);
