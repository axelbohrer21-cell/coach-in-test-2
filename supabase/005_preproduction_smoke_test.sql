-- Contrôles non destructifs après installation des migrations 001 à 004.
-- Ce script vérifie la présence des objets et la règle de jours de cours adultes.
do $$
declare missing text[] := array[]::text[];
begin
  if to_regclass('public.profiles') is null then missing := array_append(missing,'public.profiles'); end if;
  if to_regclass('public.coach_players') is null then missing := array_append(missing,'public.coach_players'); end if;
  if to_regclass('public.training_sessions') is null then missing := array_append(missing,'public.training_sessions'); end if;
  if to_regclass('public.evaluations') is null then missing := array_append(missing,'public.evaluations'); end if;
  if to_regclass('public.group_sessions') is null then missing := array_append(missing,'public.group_sessions'); end if;
  if to_regclass('public.group_course_series') is null then missing := array_append(missing,'public.group_course_series'); end if;
  if to_regclass('public.coach_player_invitations') is null then missing := array_append(missing,'public.coach_player_invitations'); end if;
  if to_regprocedure('public.invite_coach_to_player(uuid,text)') is null then missing := array_append(missing,'function invite_coach_to_player'); end if;
  if to_regprocedure('public.respond_coach_player_invitation(uuid,boolean)') is null then missing := array_append(missing,'function respond_coach_player_invitation'); end if;
  if to_regprocedure('public.revoke_coach_player_invitation(uuid)') is null then missing := array_append(missing,'function revoke_coach_player_invitation'); end if;
  if to_regprocedure('public.request_private_booking(uuid,date,time,integer,smallint)') is null then missing := array_append(missing,'function request_private_booking with coach id'); end if;
  if cardinality(missing) > 0 then
    raise exception 'Coach In preproduction incomplet : %', array_to_string(missing, ', ');
  end if;
end $$;

-- Résultat attendu : adult weekdays = {1,2,4,5} (lundi, mardi, jeudi, vendredi).
select audience, array_agg(distinct weekday order by weekday) as weekdays
from public.group_course_series
group by audience
order by audience;

-- Résultat attendu : RLS activée sur les tables sensibles.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('profiles','coach_players','training_sessions','evaluations','coach_player_invitations','booking_requests')
order by c.relname;
