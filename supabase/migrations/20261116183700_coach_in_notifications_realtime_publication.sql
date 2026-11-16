do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='player_notifications') then
    alter publication supabase_realtime add table public.player_notifications;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='coach_notifications') then
    alter publication supabase_realtime add table public.coach_notifications;
  end if;
end $$;
