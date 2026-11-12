-- COACH IN — migration complémentaire des modules
-- Prérequis : exécuter les scripts d'initialisation/configuration existants du projet.
-- Migration additive : ne supprime aucune table ni aucune donnée existante.
-- À tester sur un projet de préproduction avant toute exécution en production.

create extension if not exists pgcrypto;

-- Informations de profil validées par le coach.
alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists fft_ranking text not null default '',
  add column if not exists age_category text not null default '',
  add column if not exists player_type text not null default 'Loisir',
  add column if not exists avatar_url text,
  add column if not exists archived_at timestamptz;

-- Relation coach / joueur déjà présente dans l'application.
create or replace function public.is_linked_player(p_player_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coach_players cp
    where cp.coach_id = (select auth.uid()) and cp.player_id = p_player_id
  );
$$;

-- Demande de rattachement d'un joueur à un coach.
create table if not exists public.player_access_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  coach_email text not null,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(player_id, coach_email)
);

-- Cours collectifs et indisponibilités du coach.
create table if not exists public.group_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  theme text not null default '',
  session_date date not null,
  start_time time not null,
  end_time time not null,
  court_number smallint check (court_number between 1 and 4),
  audience text not null check (audience in ('adultes','enfants')),
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  source_week integer,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.coach_unavailability (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  private_reason text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- Demandes de cours particuliers. Les conflits horaires doivent être contrôlés côté serveur
-- avant confirmation ; la simple insertion d'une demande ne réserve pas définitivement un court.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes in (60,90,120)),
  court_number smallint check (court_number between 1 and 4),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  coach_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (player_id <> coach_id)
);

-- Bibliothèques distinctes collectif / particulier.
create table if not exists public.session_library (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('collectif','particulier')),
  title text not null,
  theme text not null default '',
  subtheme text not null default '',
  level text not null default 'Tous niveaux',
  keywords text[] not null default '{}',
  objective text not null default '',
  equipment text not null default '',
  setup text not null default '',
  instructions text not null default '',
  rotations text not null default '',
  variations text not null default '',
  duration_minutes integer,
  illustration_url text,
  source_week integer,
  court_number smallint check (court_number between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Critères d'évaluation : les lignes sont stockées individuellement, sans fusion automatique.
create table if not exists public.criteria_catalog (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  main_theme text not null,
  subtheme text not null default '',
  criterion text not null,
  criterion_type text not null check (criterion_type in ('positive','improvement')),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  criterion_id uuid references public.criteria_catalog(id) on delete set null,
  main_theme text not null,
  subtheme text not null default '',
  criterion text not null,
  criterion_type text not null check (criterion_type in ('positive','improvement')),
  created_at timestamptz not null default now()
);

create table if not exists public.player_challenges (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  criterion text not null,
  objective text not null,
  target_value numeric,
  current_value numeric,
  status text not null default 'active' check (status in ('active','completed')),
  consecutive_successes integer not null default 0 check (consecutive_successes >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.player_achievements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  criterion text not null,
  validation_count integer not null default 3 check (validation_count >= 3),
  unlocked_at timestamptz not null default now(),
  unique(player_id, criterion)
);

create table if not exists public.coach_notifications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid references public.profiles(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null default '',
  target_path text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.player_notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
  target_path text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  booking_requests boolean not null default true,
  booking_decisions boolean not null default true,
  booking_changes boolean not null default true,
  reminders_24h boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_settings (
  coach_id uuid primary key references public.profiles(id) on delete cascade,
  timezone text not null default 'Europe/Paris',
  updated_at timestamptz not null default now()
);

-- Index de consultation.
create index if not exists idx_group_sessions_coach_date on public.group_sessions(coach_id, session_date);
create index if not exists idx_booking_requests_coach_date on public.booking_requests(coach_id, session_date, status);
create index if not exists idx_session_library_keywords on public.session_library using gin(keywords);
create index if not exists idx_criteria_catalog_lookup on public.criteria_catalog(coach_id, main_theme, subtheme, display_order);
create index if not exists idx_evaluation_criteria_eval on public.evaluation_criteria(evaluation_id);
create index if not exists idx_challenges_player_status on public.player_challenges(player_id, status);
create index if not exists idx_coach_notifications_unread on public.coach_notifications(coach_id, created_at desc) where read_at is null;
create index if not exists idx_player_notifications_unread on public.player_notifications(player_id, created_at desc) where read_at is null;

-- RLS : les accès coach sont limités à ses propres données et à ses joueurs associés.
alter table public.player_access_requests enable row level security;
alter table public.group_sessions enable row level security;
alter table public.coach_unavailability enable row level security;
alter table public.booking_requests enable row level security;
alter table public.session_library enable row level security;
alter table public.criteria_catalog enable row level security;
alter table public.evaluation_criteria enable row level security;
alter table public.player_challenges enable row level security;
alter table public.player_achievements enable row level security;
alter table public.coach_notifications enable row level security;
alter table public.player_notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.coach_settings enable row level security;

-- Demandes d'accès : joueur crée/lit sa demande, coach lit les demandes destinées à son e-mail.
drop policy if exists access_request_player_select on public.player_access_requests;
create policy access_request_player_select on public.player_access_requests for select to authenticated
using (player_id = (select auth.uid()));
drop policy if exists access_request_player_insert on public.player_access_requests;
create policy access_request_player_insert on public.player_access_requests for insert to authenticated
with check (player_id = (select auth.uid()));
drop policy if exists access_request_coach_select on public.player_access_requests;
create policy access_request_coach_select on public.player_access_requests for select to authenticated
using (public.is_coach() and lower(coach_email) = lower((select auth.jwt() ->> 'email')));

-- Groupes et indisponibilités : coach propriétaire uniquement.
drop policy if exists group_sessions_owner_all on public.group_sessions;
create policy group_sessions_owner_all on public.group_sessions for all to authenticated
using (coach_id = (select auth.uid()) and public.is_coach())
with check (coach_id = (select auth.uid()) and public.is_coach());
drop policy if exists unavailability_owner_all on public.coach_unavailability;
create policy unavailability_owner_all on public.coach_unavailability for all to authenticated
using (coach_id = (select auth.uid()) and public.is_coach())
with check (coach_id = (select auth.uid()) and public.is_coach());

-- Réservations : joueur ne crée que pour lui-même et pour le coach lié ; coach gère ses demandes.
drop policy if exists booking_player_select on public.booking_requests;
create policy booking_player_select on public.booking_requests for select to authenticated
using (player_id = (select auth.uid()));
drop policy if exists booking_player_insert on public.booking_requests;
create policy booking_player_insert on public.booking_requests for insert to authenticated
with check (player_id = (select auth.uid()) and exists (
  select 1 from public.coach_players cp where cp.player_id = (select auth.uid()) and cp.coach_id = coach_id
));
drop policy if exists booking_coach_select on public.booking_requests;
create policy booking_coach_select on public.booking_requests for select to authenticated
using (coach_id = (select auth.uid()) and public.is_coach());
drop policy if exists booking_coach_update on public.booking_requests;
create policy booking_coach_update on public.booking_requests for update to authenticated
using (coach_id = (select auth.uid()) and public.is_coach())
with check (coach_id = (select auth.uid()) and public.is_coach());

-- Bibliothèque et catalogue : coach propriétaire uniquement.
drop policy if exists library_owner_all on public.session_library;
create policy library_owner_all on public.session_library for all to authenticated
using (coach_id = (select auth.uid()) and public.is_coach())
with check (coach_id = (select auth.uid()) and public.is_coach());
drop policy if exists criteria_owner_all on public.criteria_catalog;
create policy criteria_owner_all on public.criteria_catalog for all to authenticated
using (coach_id = (select auth.uid()) and public.is_coach())
with check (coach_id = (select auth.uid()) and public.is_coach());
drop policy if exists evaluation_criteria_coach_all on public.evaluation_criteria;
create policy evaluation_criteria_coach_all on public.evaluation_criteria for all to authenticated
using (public.is_coach() and exists (select 1 from public.evaluations e join public.coach_players cp on cp.player_id=e.player_id where e.id=evaluation_id and cp.coach_id=(select auth.uid())))
with check (public.is_coach() and exists (select 1 from public.evaluations e join public.coach_players cp on cp.player_id=e.player_id where e.id=evaluation_id and cp.coach_id=(select auth.uid())));
drop policy if exists evaluation_criteria_player_select on public.evaluation_criteria;
create policy evaluation_criteria_player_select on public.evaluation_criteria for select to authenticated
using (exists (select 1 from public.evaluations e where e.id=evaluation_id and e.player_id=(select auth.uid())));

-- Un seul défi actif par joueur ; l'historique des défis terminés est conservé.
create unique index if not exists idx_one_active_challenge_per_player
on public.player_challenges(player_id) where status='active';

-- Défis et réussites : coach gère, joueur consulte uniquement les siens.
drop policy if exists challenges_coach_all on public.player_challenges;
create policy challenges_coach_all on public.player_challenges for all to authenticated
using (coach_id = (select auth.uid()) and public.is_coach())
with check (coach_id = (select auth.uid()) and public.is_coach());
drop policy if exists challenges_player_select on public.player_challenges;
create policy challenges_player_select on public.player_challenges for select to authenticated
using (player_id = (select auth.uid()));
drop policy if exists achievements_coach_all on public.player_achievements;
create policy achievements_coach_all on public.player_achievements for all to authenticated
using (coach_id = (select auth.uid()) and public.is_coach())
with check (coach_id = (select auth.uid()) and public.is_coach());
drop policy if exists achievements_player_select on public.player_achievements;
create policy achievements_player_select on public.player_achievements for select to authenticated
using (player_id = (select auth.uid()));

-- Notifications : chaque utilisateur ne lit/modifie que ses notifications.
drop policy if exists coach_notifications_owner_all on public.coach_notifications;
create policy coach_notifications_owner_all on public.coach_notifications for all to authenticated
using (coach_id = (select auth.uid()) and public.is_coach())
with check (coach_id = (select auth.uid()) and public.is_coach());
drop policy if exists player_notifications_owner_all on public.player_notifications;
create policy player_notifications_owner_all on public.player_notifications for all to authenticated
using (player_id = (select auth.uid())) with check (player_id = (select auth.uid()));
drop policy if exists notification_preferences_owner_all on public.notification_preferences;
create policy notification_preferences_owner_all on public.notification_preferences for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists coach_settings_owner_all on public.coach_settings;
create policy coach_settings_owner_all on public.coach_settings for all to authenticated
using (coach_id = (select auth.uid()) and public.is_coach())
with check (coach_id = (select auth.uid()) and public.is_coach());

-- Fin de migration. Les fonctions planifiées (rappels 24h, génération des défis,
-- calcul des catégories FFT, contrôle anti-chevauchement et notifications automatiques)
-- nécessitent des Edge Functions / tâches planifiées et ne sont pas activées par ce SQL.

alter table public.training_sessions add column if not exists court_number smallint check (court_number between 1 and 4);
alter table public.training_sessions add column if not exists status text not null default 'Prévue';

-- Réservation transactionnelle : un créneau demandé ou confirmé bloque les demandes concurrentes.
-- Le coach doit toujours valider la demande. Les créneaux de travail autorisés restent à configurer.
create or replace function public.request_private_booking(
  p_session_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_court_number smallint
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_player uuid := auth.uid();
  v_coach uuid;
  v_id uuid;
  v_start timestamp;
  v_end timestamp;
begin
  if v_player is null then raise exception 'Connexion requise.'; end if;
  if p_duration_minutes not in (60,90,120) then raise exception 'Durée non autorisée.'; end if;
  if p_court_number not between 1 and 4 then raise exception 'Court invalide.'; end if;
  select cp.coach_id into v_coach from public.coach_players cp where cp.player_id = v_player order by cp.created_at limit 1;
  if v_coach is null then raise exception 'Aucun coach associé à ce compte.'; end if;
  v_start := p_session_date + p_start_time;
  v_end := v_start + make_interval(mins => p_duration_minutes);
  if v_start <= now() then raise exception 'Le créneau doit être dans le futur.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_coach::text || p_session_date::text || p_court_number::text, 0));
  if exists (
    select 1 from public.booking_requests b
    where b.coach_id = v_coach and b.session_date = p_session_date and b.court_number = p_court_number
      and b.status in ('pending','accepted')
      and (b.session_date + b.start_time) < v_end
      and (b.session_date + b.start_time + make_interval(mins => b.duration_minutes)) > v_start
  ) then raise exception 'Ce créneau est déjà demandé ou réservé.'; end if;
  if exists (
    select 1 from public.training_sessions s
    where s.created_by = v_coach and s.session_date = p_session_date
      and coalesce(s.court_number, p_court_number) = p_court_number
      and (s.session_date + coalesce(s.session_time, time '00:00')) < v_end
      and (s.session_date + coalesce(s.session_time, time '00:00') + make_interval(mins => coalesce(s.duration_minutes,60))) > v_start
  ) then raise exception 'Le coach a déjà une séance sur ce créneau.'; end if;
  if exists (
    select 1 from public.group_sessions g
    where g.coach_id = v_coach and g.session_date = p_session_date and g.court_number = p_court_number
      and g.status <> 'cancelled' and (g.session_date + g.start_time) < v_end and (g.session_date + g.end_time) > v_start
  ) then raise exception 'Un cours collectif occupe déjà ce court.'; end if;
  insert into public.booking_requests(coach_id, player_id, session_date, start_time, duration_minutes, court_number, status)
  values(v_coach, v_player, p_session_date, p_start_time, p_duration_minutes, p_court_number, 'pending') returning id into v_id;
  insert into public.coach_notifications(coach_id, player_id, notification_type, title, body, target_path)
  values(v_coach, v_player, 'booking_request', 'Nouvelle demande de cours', 'Une demande de cours particulier attend ta réponse.', 'bookings');
  return v_id;
end; $$;

create or replace function public.review_private_booking(p_request_id uuid, p_decision text, p_coach_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_booking public.booking_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Décision invalide.'; end if;
  select * into v_booking from public.booking_requests where id = p_request_id for update;
  if not found or v_booking.coach_id <> auth.uid() then raise exception 'Demande introuvable.'; end if;
  if v_booking.status <> 'pending' then raise exception 'Cette demande a déjà été traitée.'; end if;
  if p_decision = 'accepted' then
    perform pg_advisory_xact_lock(hashtextextended(v_booking.coach_id::text || v_booking.session_date::text || v_booking.court_number::text, 0));
    if exists (select 1 from public.booking_requests b where b.id <> v_booking.id and b.coach_id = v_booking.coach_id and b.session_date = v_booking.session_date and b.court_number = v_booking.court_number and b.status = 'accepted' and (b.session_date+b.start_time) < (v_booking.session_date+v_booking.start_time+make_interval(mins=>v_booking.duration_minutes)) and (b.session_date+b.start_time+make_interval(mins=>b.duration_minutes)) > (v_booking.session_date+v_booking.start_time)) then raise exception 'Conflit : le créneau a été réservé entre-temps.'; end if;
    if exists (select 1 from public.training_sessions s where s.created_by=v_booking.coach_id and s.session_date=v_booking.session_date and coalesce(s.court_number,v_booking.court_number)=v_booking.court_number and (s.session_date+coalesce(s.session_time,time '00:00')) < (v_booking.session_date+v_booking.start_time+make_interval(mins=>v_booking.duration_minutes)) and (s.session_date+coalesce(s.session_time,time '00:00')+make_interval(mins=>coalesce(s.duration_minutes,60))) > (v_booking.session_date+v_booking.start_time)) then raise exception 'Conflit : le coach a ajouté une séance sur ce créneau.'; end if;
    if exists (select 1 from public.group_sessions g where g.coach_id=v_booking.coach_id and g.session_date=v_booking.session_date and g.court_number=v_booking.court_number and g.status <> 'cancelled' and (g.session_date+g.start_time) < (v_booking.session_date+v_booking.start_time+make_interval(mins=>v_booking.duration_minutes)) and (g.session_date+g.end_time) > (v_booking.session_date+v_booking.start_time)) then raise exception 'Conflit : un cours collectif occupe ce court.'; end if;
  end if;
  update public.booking_requests set status=p_decision, coach_note=coalesce(p_coach_note,''), reviewed_at=now() where id=p_request_id;
  insert into public.player_notifications(player_id, notification_type, title, body, target_path)
  values(v_booking.player_id, 'booking_decision', case when p_decision='accepted' then 'Cours confirmé' else 'Demande refusée' end,
    case when p_decision='accepted' then 'Ta demande de cours particulier a été acceptée.' else 'Ta demande de cours particulier n’a pas été acceptée.' end, 'bookings');
end; $$;

create or replace function public.cancel_private_booking(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_booking public.booking_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select * into v_booking from public.booking_requests where id=p_request_id for update;
  if not found or v_booking.player_id <> auth.uid() then raise exception 'Réservation introuvable.'; end if;
  if v_booking.status not in ('pending','accepted') then raise exception 'Cette réservation ne peut plus être annulée.'; end if;
  if (v_booking.session_date + v_booking.start_time) - now() < interval '24 hours' then raise exception 'L’annulation est impossible moins de 24 h avant le cours.'; end if;
  update public.booking_requests set status='cancelled' where id=p_request_id;
  insert into public.coach_notifications(coach_id, player_id, notification_type, title, body, target_path)
  values(v_booking.coach_id, v_booking.player_id, 'booking_cancelled', 'Cours annulé', 'Un joueur a annulé sa demande ou son cours.', 'bookings');
end; $$;

revoke all on function public.request_private_booking(date,time,integer,smallint) from public;
revoke all on function public.review_private_booking(uuid,text,text) from public;
revoke all on function public.cancel_private_booking(uuid) from public;
grant execute on function public.request_private_booking(date,time,integer,smallint) to authenticated;
grant execute on function public.review_private_booking(uuid,text,text) to authenticated;
grant execute on function public.cancel_private_booking(uuid) to authenticated;

-- Moteur d'évaluation détaillée : rattachement stable à l'identifiant du critère.
alter table public.evaluation_criteria
  add column if not exists measured_value numeric;
alter table public.player_challenges
  add column if not exists criterion_id uuid references public.criteria_catalog(id) on delete set null,
  add column if not exists comparison_operator text not null default 'gte' check (comparison_operator in ('gte','lte','eq'));
alter table public.player_achievements
  add column if not exists criterion_id uuid references public.criteria_catalog(id) on delete set null;

-- Les critères homonymes de sous-thèmes différents restent deux compétences distinctes.
do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
    where conrelid='public.player_achievements'::regclass and contype='u'
      and pg_get_constraintdef(oid) ilike '%player_id, criterion%'
  loop
    execute format('alter table public.player_achievements drop constraint %I', constraint_row.conname);
  end loop;
end $$;
create unique index if not exists idx_player_achievements_player_criterion_id
  on public.player_achievements(player_id, criterion_id) where criterion_id is not null;
create index if not exists idx_eval_criteria_criterion_eval
  on public.evaluation_criteria(criterion_id, evaluation_id);
