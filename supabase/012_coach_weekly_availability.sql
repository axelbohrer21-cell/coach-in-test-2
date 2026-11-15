-- Disponibilités hebdomadaires propres à chaque coach et contrôle serveur des réservations.
create table if not exists public.coach_weekly_availability (
 id uuid primary key default gen_random_uuid(),
 coach_id uuid not null references public.profiles(id) on delete cascade,
 weekday smallint not null check (weekday between 1 and 7),
 start_time time not null,
 end_time time not null,
 court_number smallint check (court_number between 1 and 4),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (end_time>start_time)
);
create index if not exists idx_coach_weekly_availability_lookup on public.coach_weekly_availability(coach_id,weekday,active,start_time);
alter table public.coach_weekly_availability enable row level security;
drop policy if exists coach_weekly_availability_owner_all on public.coach_weekly_availability;
create policy coach_weekly_availability_owner_all on public.coach_weekly_availability for all to authenticated
using (coach_id=(select auth.uid()) and public.is_coach())
with check (coach_id=(select auth.uid()) and public.is_coach());
drop policy if exists coach_weekly_availability_player_read on public.coach_weekly_availability;
create policy coach_weekly_availability_player_read on public.coach_weekly_availability for select to authenticated
using (active and exists(select 1 from public.coach_players cp where cp.coach_id=coach_weekly_availability.coach_id and cp.player_id=(select auth.uid())));

create or replace function public.request_private_booking(p_coach_id uuid,p_session_date date,p_start_time time,p_duration_minutes integer,p_court_number smallint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_player uuid:=auth.uid(); v_id uuid; v_start timestamp; v_end timestamp;
begin
 if v_player is null then raise exception 'Connexion requise.'; end if;
 if not exists(select 1 from public.profiles where id=p_coach_id and role='coach' and archived_at is null) then raise exception 'Coach invalide.'; end if;
 if not exists(select 1 from public.coach_players where coach_id=p_coach_id and player_id=v_player) then raise exception 'Ce coach ne suit pas ce joueur.'; end if;
 if p_duration_minutes not in(60,90,120) then raise exception 'Durée non autorisée.'; end if;
 if p_court_number not between 1 and 4 then raise exception 'Court invalide.'; end if;
 v_start:=p_session_date+p_start_time; v_end:=v_start+make_interval(mins=>p_duration_minutes);
 if v_start<=now() then raise exception 'Le créneau doit être dans le futur.'; end if;
 if not exists(select 1 from public.coach_weekly_availability a where a.coach_id=p_coach_id and a.weekday=extract(isodow from p_session_date)::smallint and a.active=true and a.start_time<=p_start_time and a.end_time>=(p_start_time+make_interval(mins=>p_duration_minutes)) and (a.court_number is null or a.court_number=p_court_number)) then raise exception 'Ce créneau ne fait pas partie des disponibilités publiées par le coach.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_coach_id::text||p_session_date::text||p_court_number::text,0));
 if exists(select 1 from public.booking_requests b where b.coach_id=p_coach_id and b.session_date=p_session_date and b.court_number=p_court_number and b.status in('pending','accepted') and (b.session_date+b.start_time)<v_end and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes))>v_start) then raise exception 'Ce créneau est déjà demandé ou réservé.'; end if;
 if exists(select 1 from public.training_sessions s where s.created_by=p_coach_id and s.session_date=p_session_date and coalesce(s.court_number,p_court_number)=p_court_number and (s.session_date+coalesce(s.session_time,time '00:00'))<v_end and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60)))>v_start) then raise exception 'Le coach a déjà une séance sur ce créneau.'; end if;
 if exists(select 1 from public.group_sessions g where g.coach_id=p_coach_id and g.session_date=p_session_date and g.court_number=p_court_number and g.status<>'cancelled' and (g.session_date+g.start_time)<v_end and (g.session_date+g.end_time)>v_start) then raise exception 'Un cours collectif occupe ce court.'; end if;
 insert into public.booking_requests(coach_id,player_id,session_date,start_time,duration_minutes,court_number,status) values(p_coach_id,v_player,p_session_date,p_start_time,p_duration_minutes,p_court_number,'pending') returning id into v_id;
 insert into public.coach_notifications(coach_id,player_id,notification_type,title,body,target_path) values(p_coach_id,v_player,'booking_request','Nouvelle demande de cours','Une demande de cours particulier attend ta réponse.','bookings');
 return v_id;
end; $$;
revoke all on function public.request_private_booking(uuid,date,time,integer,smallint) from public,anon;
grant execute on function public.request_private_booking(uuid,date,time,integer,smallint) to authenticated;
