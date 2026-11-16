create table if not exists public.coach_video_analyses (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  stroke_type text not null default 'general' check (stroke_type in ('general','service','forehand','backhand','volley','return','footwork')),
  video_path text not null,
  video_mime text not null check (video_mime in ('video/mp4','video/quicktime','video/webm')),
  video_size_bytes bigint not null check (video_size_bytes > 0 and video_size_bytes <= 262144000),
  duration_seconds numeric(8,2),
  status text not null default 'uploaded' check (status in ('uploaded','processing','completed','failed')),
  analysis_result jsonb,
  analysis_error text,
  model_name text,
  confidence text,
  coach_review text,
  shared_with_player boolean not null default false,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_video_duration_valid check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 600))
);
create index if not exists coach_video_analyses_coach_player_created_idx on public.coach_video_analyses(coach_id,player_id,created_at desc);
alter table public.coach_video_analyses enable row level security;
drop policy if exists coach_video_analyses_select on public.coach_video_analyses;
create policy coach_video_analyses_select on public.coach_video_analyses for select to authenticated
using (exists (select 1 from public.coach_players cp
 join public.profiles c on c.id=cp.coach_id and c.role='coach' and c.archived_at is null
 join public.profiles p on p.id=cp.player_id and p.role='player' and p.archived_at is null
 where cp.coach_id=coach_video_analyses.coach_id and cp.player_id=coach_video_analyses.player_id
 and ((auth.uid()=coach_video_analyses.coach_id and public.is_coach())
 or (auth.uid()=coach_video_analyses.player_id and public.is_player() and coach_video_analyses.shared_with_player=true))));
drop policy if exists coach_video_analyses_insert on public.coach_video_analyses;
create policy coach_video_analyses_insert on public.coach_video_analyses for insert to authenticated
with check (coach_id=auth.uid() and public.is_coach() and status='uploaded' and shared_with_player=false
 and exists (select 1 from public.coach_players cp join public.profiles p on p.id=cp.player_id and p.role='player' and p.archived_at is null where cp.coach_id=auth.uid() and cp.player_id=coach_video_analyses.player_id));
drop policy if exists coach_video_analyses_update on public.coach_video_analyses;
create policy coach_video_analyses_update on public.coach_video_analyses for update to authenticated
using (coach_id=auth.uid() and public.is_coach())
with check (coach_id=auth.uid() and public.is_coach() and exists (select 1 from public.coach_players cp where cp.coach_id=auth.uid() and cp.player_id=coach_video_analyses.player_id));
drop policy if exists coach_video_analyses_delete on public.coach_video_analyses;
create policy coach_video_analyses_delete on public.coach_video_analyses for delete to authenticated using (coach_id=auth.uid() and public.is_coach());
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('coach-in-videos','coach-in-videos',false,262144000,array['video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public=false,file_size_limit=262144000,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists coach_in_videos_select on storage.objects;
create policy coach_in_videos_select on storage.objects for select to authenticated
using (case when bucket_id <> 'coach-in-videos' then false
 when coalesce(array_length(storage.foldername(name),1),0) < 3 then false
 when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 when (storage.foldername(name))[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 when (storage.foldername(name))[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 else exists (select 1 from public.coach_video_analyses a join public.coach_players cp on cp.coach_id=a.coach_id and cp.player_id=a.player_id
 where a.coach_id=((storage.foldername(name))[1])::uuid and a.player_id=((storage.foldername(name))[2])::uuid and a.id=((storage.foldername(name))[3])::uuid
 and ((auth.uid()=a.coach_id and public.is_coach()) or (auth.uid()=a.player_id and public.is_player() and a.shared_with_player=true))) end);
drop policy if exists coach_in_videos_insert on storage.objects;
create policy coach_in_videos_insert on storage.objects for insert to authenticated
with check (case when bucket_id <> 'coach-in-videos' then false
 when coalesce(array_length(storage.foldername(name),1),0) < 3 then false
 when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 when (storage.foldername(name))[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 when (storage.foldername(name))[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
 else exists (select 1 from public.coach_players cp join public.profiles c on c.id=cp.coach_id and c.role='coach' and c.archived_at is null join public.profiles p on p.id=cp.player_id and p.role='player' and p.archived_at is null where cp.coach_id=((storage.foldername(name))[1])::uuid and cp.player_id=((storage.foldername(name))[2])::uuid and cp.coach_id=auth.uid() and public.is_coach()) end);
drop policy if exists coach_in_videos_delete on storage.objects;
create policy coach_in_videos_delete on storage.objects for delete to authenticated
using (case when bucket_id <> 'coach-in-videos' then false when coalesce(array_length(storage.foldername(name),1),0) < 3 then false
 else exists (select 1 from public.coach_video_analyses a where a.coach_id=auth.uid() and a.coach_id=((storage.foldername(name))[1])::uuid and a.player_id=((storage.foldername(name))[2])::uuid and a.id=((storage.foldername(name))[3])::uuid and public.is_coach()) end);