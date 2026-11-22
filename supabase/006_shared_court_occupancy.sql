-- Coach In: projection minimale et sécurisée des occupations de courts.
-- Appliquée sur la base de préproduction whyylgiscrpqoahdzdkv.
create table if not exists public.shared_court_occupancy (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  court_number smallint,
  source_kind text not null check (source_kind in ('booking','private_session','group_session')),
  source_id uuid not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique (source_kind, source_id),
  check (end_time > start_time),
  check (court_number is null or court_number between 1 and 4)
);

create index if not exists idx_shared_court_occupancy_coach_date
  on public.shared_court_occupancy(coach_id, session_date, start_time);

alter table public.shared_court_occupancy enable row level security;
revoke all on public.shared_court_occupancy from anon, public;
grant select on public.shared_court_occupancy to authenticated;
drop policy if exists shared_court_occupancy_linked_read on public.shared_court_occupancy;
create policy shared_court_occupancy_linked_read
on public.shared_court_occupancy
for select to authenticated
using (
  coach_id = (select auth.uid())
  or exists (
    select 1 from public.coach_players cp
    where cp.coach_id = shared_court_occupancy.coach_id
      and cp.player_id = (select auth.uid())
  )
);

create or replace function public.sync_booking_shared_court_occupancy()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.shared_court_occupancy where source_kind='booking' and source_id=old.id;
    return old;
  end if;
  if new.status in ('pending','accepted') then
    insert into public.shared_court_occupancy
      (coach_id,session_date,start_time,end_time,court_number,source_kind,source_id,status)
    values
      (new.coach_id,new.session_date,new.start_time,
       new.start_time + make_interval(mins=>new.duration_minutes),
       new.court_number,'booking',new.id,new.status)
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=excluded.court_number,status=excluded.status;
  else
    delete from public.shared_court_occupancy where source_kind='booking' and source_id=new.id;
  end if;
  return new;
end;
$$;

create or replace function public.sync_training_shared_court_occupancy()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.shared_court_occupancy where source_kind='private_session' and source_id=old.id;
    return old;
  end if;
  if new.session_time is not null
     and lower(coalesce(new.status,'')) not in ('annulée','annulee','annule','annulé','cancelled','canceled') then
    insert into public.shared_court_occupancy
      (coach_id,session_date,start_time,end_time,court_number,source_kind,source_id,status)
    values
      (new.created_by,new.session_date,new.session_time,
       new.session_time + make_interval(mins=>new.duration_minutes),
       new.court_number,'private_session',new.id,'scheduled')
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=excluded.court_number,status=excluded.status;
  else
    delete from public.shared_court_occupancy where source_kind='private_session' and source_id=new.id;
  end if;
  return new;
end;
$$;

create or replace function public.sync_group_shared_court_occupancy()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.shared_court_occupancy where source_kind='group_session' and source_id=old.id;
    return old;
  end if;
  if new.status='scheduled' then
    insert into public.shared_court_occupancy
      (coach_id,session_date,start_time,end_time,court_number,source_kind,source_id,status)
    values
      (new.coach_id,new.session_date,new.start_time,new.end_time,
       new.court_number,'group_session',new.id,'scheduled')
    on conflict (source_kind,source_id) do update set
      coach_id=excluded.coach_id,session_date=excluded.session_date,
      start_time=excluded.start_time,end_time=excluded.end_time,
      court_number=excluded.court_number,status=excluded.status;
  else
    delete from public.shared_court_occupancy where source_kind='group_session' and source_id=new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_booking_shared_court_occupancy() from public,anon,authenticated;
revoke all on function public.sync_training_shared_court_occupancy() from public,anon,authenticated;
revoke all on function public.sync_group_shared_court_occupancy() from public,anon,authenticated;

drop trigger if exists trg_sync_booking_shared_court_occupancy on public.booking_requests;
create trigger trg_sync_booking_shared_court_occupancy
after insert or update or delete on public.booking_requests
for each row execute function public.sync_booking_shared_court_occupancy();

drop trigger if exists trg_sync_training_shared_court_occupancy on public.training_sessions;
create trigger trg_sync_training_shared_court_occupancy
after insert or update or delete on public.training_sessions
for each row execute function public.sync_training_shared_court_occupancy();

drop trigger if exists trg_sync_group_shared_court_occupancy on public.group_sessions;
create trigger trg_sync_group_shared_court_occupancy
after insert or update or delete on public.group_sessions
for each row execute function public.sync_group_shared_court_occupancy();

insert into public.shared_court_occupancy
  (coach_id,session_date,start_time,end_time,court_number,source_kind,source_id,status)
select coach_id,session_date,start_time,start_time+make_interval(mins=>duration_minutes),
       court_number,'booking',id,status
from public.booking_requests where status in ('pending','accepted')
on conflict (source_kind,source_id) do update set
  coach_id=excluded.coach_id,session_date=excluded.session_date,
  start_time=excluded.start_time,end_time=excluded.end_time,
  court_number=excluded.court_number,status=excluded.status;

insert into public.shared_court_occupancy
  (coach_id,session_date,start_time,end_time,court_number,source_kind,source_id,status)
select created_by,session_date,session_time,session_time+make_interval(mins=>duration_minutes),
       court_number,'private_session',id,'scheduled'
from public.training_sessions
where session_time is not null
  and lower(coalesce(status,'')) not in ('annulée','annulee','annule','annulé','cancelled','canceled')
on conflict (source_kind,source_id) do update set
  coach_id=excluded.coach_id,session_date=excluded.session_date,
  start_time=excluded.start_time,end_time=excluded.end_time,
  court_number=excluded.court_number,status=excluded.status;

insert into public.shared_court_occupancy
  (coach_id,session_date,start_time,end_time,court_number,source_kind,source_id,status)
select coach_id,session_date,start_time,end_time,court_number,'group_session',id,'scheduled'
from public.group_sessions where status='scheduled'
on conflict (source_kind,source_id) do update set
  coach_id=excluded.coach_id,session_date=excluded.session_date,
  start_time=excluded.start_time,end_time=excluded.end_time,
  court_number=excluded.court_number,status=excluded.status;

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public'
         and tablename='shared_court_occupancy') then
    alter publication supabase_realtime add table public.shared_court_occupancy;
  end if;
end;
$$;
