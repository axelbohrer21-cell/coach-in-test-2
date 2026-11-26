-- Coach A: programmation annuelle des cours collectifs 2026-2027.
-- Les blocs sont déclinés par terrain pour que chaque court soit réservé et comptabilisé indépendamment.
-- L'insertion est idempotente : une relance ne crée ni doublon de série ni doublon de séance.

with defs(title,audience,weekday,start_time,end_time,court_number,target_sessions,theme) as (
  values
  ('Cours collectifs adultes · Lundi · Terrain 1','adultes',1,'17:00'::time,'21:00'::time,1,28,'Cours collectif'),
  ('Cours collectifs adultes · Lundi · Terrain 2','adultes',1,'17:00'::time,'21:00'::time,2,28,'Cours collectif'),
  ('Cours collectifs adultes · Mardi · Terrain 1','adultes',2,'17:30'::time,'20:30'::time,1,28,'Cours collectif'),
  ('Cours collectifs adultes · Mardi · Terrain 2','adultes',2,'17:30'::time,'20:30'::time,2,28,'Cours collectif'),
  ('Cours collectifs adultes · Mardi · Terrain 3','adultes',2,'17:30'::time,'20:30'::time,3,28,'Cours collectif'),
  ('Cours collectifs adultes · Mercredi · Terrain 1','adultes',3,'18:00'::time,'21:00'::time,1,28,'Cours collectif'),
  ('Cours collectifs adultes · Mercredi · Terrain 2','adultes',3,'18:00'::time,'21:00'::time,2,28,'Cours collectif'),
  ('Cours collectifs adultes · Mercredi · Terrain 3','adultes',3,'18:00'::time,'21:00'::time,3,28,'Cours collectif'),
  ('Cours collectifs adultes · Jeudi · Terrain 1','adultes',4,'17:30'::time,'19:00'::time,1,28,'Cours collectif'),
  ('Cours collectifs adultes · Jeudi · Terrain 2','adultes',4,'17:30'::time,'19:00'::time,2,28,'Cours collectif'),
  ('Cours collectifs adultes · Vendredi · Terrain 1','adultes',5,'17:30'::time,'20:00'::time,1,28,'Cours collectif'),
  ('Cours collectifs adultes · Vendredi · Terrain 2','adultes',5,'17:30'::time,'20:00'::time,2,28,'Cours collectif'),
  ('Cours collectifs enfants · Mercredi · Terrain 1','enfants',3,'09:30'::time,'18:00'::time,1,30,'Cours collectif'),
  ('Cours collectifs enfants · Mercredi · Terrain 2','enfants',3,'09:30'::time,'18:00'::time,2,30,'Cours collectif'),
  ('Cours collectifs enfants · Mercredi · Terrain 3','enfants',3,'09:30'::time,'18:00'::time,3,30,'Cours collectif'),
  ('Cours collectifs enfants · Samedi · Terrain 1','enfants',6,'09:30'::time,'14:30'::time,1,30,'Cours collectif'),
  ('Cours collectifs enfants · Samedi · Terrain 2','enfants',6,'09:30'::time,'14:30'::time,2,30,'Cours collectif'),
  ('Cours collectifs enfants · Samedi · Terrain 3','enfants',6,'09:30'::time,'14:30'::time,3,30,'Cours collectif')
),
coach as (
  select id from public.profiles where lower(email)='coacha@gmail.com' and role='coach'
),
inserted_series as (
  insert into public.group_course_series
    (coach_id,title,audience,weekday,start_time,end_time,court_number,target_sessions,theme,season_start,season_end,active)
  select coach.id,d.title,d.audience,d.weekday,d.start_time,d.end_time,d.court_number,d.target_sessions,d.theme,
         date '2026-09-14',date '2027-06-20',true
  from defs d cross join coach
  where not exists (
    select 1 from public.group_course_series s
    where s.coach_id=coach.id and s.title=d.title and s.weekday=d.weekday and s.court_number=d.court_number
  )
  returning *
),
series as (
  select * from inserted_series
  union all
  select s.* from public.group_course_series s cross join coach
  where s.coach_id=coach.id and s.title in (select title from defs)
),
season_dates as (
  select d::date as session_date from generate_series(date '2026-09-14',date '2027-06-20',interval '1 day') d
),
regular_sessions as (
  select s.coach_id,s.id as series_id,s.title,s.theme,d.session_date,s.start_time,s.end_time,s.court_number,s.audience
  from series s cross join season_dates d
  where extract(dow from d.session_date)::int=s.weekday
    and not (
      d.session_date between date '2026-10-17' and date '2026-11-02'
      or d.session_date between date '2026-12-19' and date '2027-01-04'
      or d.session_date between date '2027-02-20' and date '2027-03-08'
      or d.session_date between date '2027-04-17' and date '2027-05-03'
    )
    and d.session_date not in (date '2026-11-02',date '2026-11-12')
    and (s.audience='enfants' or d.session_date not in (
      date '2026-11-01',date '2026-11-11',date '2026-12-25',date '2027-01-01',
      date '2027-04-05',date '2027-05-01',date '2027-05-06',date '2027-05-08',date '2027-05-17'
    ))
),
breaks(start_date,end_date,label) as (
  values
    (date '2026-10-17',date '2026-11-02','Toussaint'),
    (date '2026-12-19',date '2027-01-04','Noël'),
    (date '2027-02-20',date '2027-03-08','Hiver'),
    (date '2027-04-17',date '2027-05-03','Printemps')
),
stage_dates as (
  select b.label,d::date as session_date
  from breaks b cross join lateral generate_series(b.start_date,b.end_date,interval '1 day') d
  where extract(isodow from d) between 1 and 5
    and d::date not in (date '2026-11-02',date '2026-12-25',date '2027-01-01')
),
stage_sessions as (
  select coach.id as coach_id,null::uuid as series_id,
         'Stage enfants · Vacances de '||sd.label as title,'Stage enfants' as theme,
         sd.session_date,'09:30'::time as start_time,'16:30'::time as end_time,
         c.court_number,'enfants'::text as audience
  from stage_dates sd cross join coach cross join (values(1),(2),(3)) c(court_number)
),
special_saturdays as (
  select s.coach_id,s.id as series_id,
         'Cours collectif enfants · Samedi vacances · Terrain '||s.court_number as title,
         'Cours collectif enfants · samedi de vacances' as theme,
         v.session_date,'09:30'::time as start_time,'14:30'::time as end_time,
         s.court_number,'enfants'::text as audience
  from series s
  cross join (values(date '2026-10-17'),(date '2026-12-19'),(date '2027-02-20'),(date '2027-04-17')) v(session_date)
  where s.audience='enfants' and s.weekday=6
),
candidates as (
  select * from regular_sessions
  union all select * from stage_sessions
  union all select * from special_saturdays
)
insert into public.group_sessions
  (coach_id,series_id,title,theme,session_date,start_time,end_time,court_number,audience,status)
select c.coach_id,c.series_id,c.title,c.theme,c.session_date,c.start_time,c.end_time,c.court_number,c.audience,'scheduled'
from candidates c
where not exists (
  select 1 from public.group_sessions g
  where g.coach_id=c.coach_id and g.session_date=c.session_date
    and g.start_time=c.start_time and g.end_time=c.end_time
    and g.court_number=c.court_number and g.title=c.title
);
