-- Publie les nouveaux messages pour les abonnements Realtime filtrés et protégés par RLS.
do $$
begin
 if not exists (
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='coach_player_messages'
 ) then
  alter publication supabase_realtime add table public.coach_player_messages;
 end if;
end $$;
