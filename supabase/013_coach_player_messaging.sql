create table if not exists public.coach_player_messages (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id) on delete cascade,
 player_id uuid not null references public.profiles(id) on delete cascade, sender_id uuid not null references public.profiles(id) on delete cascade,
 body text not null default '', attachment_path text, attachment_name text, attachment_mime text, attachment_size bigint,
 created_at timestamptz not null default now(),
 check (length(trim(body))>0 or attachment_path is not null),
 check (attachment_size is null or attachment_size between 1 and 52428800)
);
create index if not exists idx_coach_player_messages_thread on public.coach_player_messages(coach_id,player_id,created_at);
alter table public.coach_player_messages enable row level security;
drop policy if exists messages_thread_read on public.coach_player_messages;
create policy messages_thread_read on public.coach_player_messages for select to authenticated
using ((sender_id=(select auth.uid()) or coach_id=(select auth.uid()) or player_id=(select auth.uid()))
 and exists(select 1 from public.coach_players cp where cp.coach_id=coach_player_messages.coach_id and cp.player_id=coach_player_messages.player_id));
drop policy if exists messages_thread_insert on public.coach_player_messages;
create policy messages_thread_insert on public.coach_player_messages for insert to authenticated
with check (sender_id=(select auth.uid()) and ((select auth.uid())=coach_id or (select auth.uid())=player_id)
 and exists(select 1 from public.coach_players cp where cp.coach_id=coach_player_messages.coach_id and cp.player_id=coach_player_messages.player_id));
grant select,insert on public.coach_player_messages to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('coach-in-attachments','coach-in-attachments',false,52428800,
 array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists coach_in_message_files_read on storage.objects;
create policy coach_in_message_files_read on storage.objects for select to authenticated
using (bucket_id='coach-in-attachments' and array_length(storage.foldername(name),1)>=2
 and exists(select 1 from public.coach_players cp where cp.coach_id=(storage.foldername(name))[1]::uuid and cp.player_id=(storage.foldername(name))[2]::uuid
 and ((select auth.uid())=cp.coach_id or (select auth.uid())=cp.player_id)));
drop policy if exists coach_in_message_files_insert on storage.objects;
create policy coach_in_message_files_insert on storage.objects for insert to authenticated
with check (bucket_id='coach-in-attachments' and array_length(storage.foldername(name),1)>=2
 and exists(select 1 from public.coach_players cp where cp.coach_id=(storage.foldername(name))[1]::uuid and cp.player_id=(storage.foldername(name))[2]::uuid
 and ((select auth.uid())=cp.coach_id or (select auth.uid())=cp.player_id)));
