create or replace function private.sync_global_coach_player_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not null then
    return new;
  end if;

  if new.role = 'player' then
    insert into public.coach_players (coach_id, player_id)
    select coach.id, new.id
    from public.profiles coach
    where coach.role = 'coach'
      and coach.archived_at is null
      and coach.id <> new.id
    on conflict (coach_id, player_id) do nothing;
  elsif new.role = 'coach' then
    insert into public.coach_players (coach_id, player_id)
    select new.id, player.id
    from public.profiles player
    where player.role = 'player'
      and player.archived_at is null
      and player.id <> new.id
    on conflict (coach_id, player_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_global_coach_player_links() from public, anon, authenticated;

drop trigger if exists trg_sync_global_coach_player_links on public.profiles;
create trigger trg_sync_global_coach_player_links
after insert or update of role, archived_at on public.profiles
for each row
execute function private.sync_global_coach_player_links();

insert into public.coach_players (coach_id, player_id)
select coach.id, player.id
from public.profiles coach
cross join public.profiles player
where coach.role = 'coach'
  and coach.archived_at is null
  and player.role = 'player'
  and player.archived_at is null
  and coach.id <> player.id
on conflict (coach_id, player_id) do nothing;
