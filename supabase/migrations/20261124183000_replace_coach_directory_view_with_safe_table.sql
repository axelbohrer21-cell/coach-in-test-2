-- Replace the security-definer view with a minimal, synchronized directory table.
drop view if exists public.player_coach_directory;
create table if not exists public.player_coach_directory (
  id uuid primary key references public.profiles(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default ''
);
alter table public.player_coach_directory enable row level security;
revoke all on public.player_coach_directory from public, anon;
grant select on public.player_coach_directory to authenticated;
drop policy if exists player_coach_directory_player_read on public.player_coach_directory;
create policy player_coach_directory_player_read
on public.player_coach_directory for select to authenticated
using (private.is_player());

create or replace function public.sync_player_coach_directory()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.player_coach_directory where id = old.id;
    return old;
  end if;
  if new.role = 'coach' and new.archived_at is null then
    insert into public.player_coach_directory(id, first_name, last_name)
    values(new.id, coalesce(new.first_name,''), coalesce(new.last_name,''))
    on conflict (id) do update
      set first_name = excluded.first_name, last_name = excluded.last_name;
  else
    delete from public.player_coach_directory where id = new.id;
  end if;
  return new;
end;
$function$;
revoke all on function public.sync_player_coach_directory() from public, anon, authenticated;

drop trigger if exists sync_player_coach_directory_trigger on public.profiles;
create trigger sync_player_coach_directory_trigger
after insert or update of first_name, last_name, role, archived_at or delete
on public.profiles
for each row execute function public.sync_player_coach_directory();

insert into public.player_coach_directory(id, first_name, last_name)
select id, coalesce(first_name,''), coalesce(last_name,'')
from public.profiles where role='coach' and archived_at is null
on conflict (id) do update
set first_name=excluded.first_name,last_name=excluded.last_name;
