-- Ensure the Tuesday co-animated activity identity is present on every persisted series,
-- occurrence and occupancy row. Safe to rerun.
-- Historical rows may overlap pre-existing private bookings; pause only the capacity guard
-- while normalizing these existing rows, then restore it immediately.
drop trigger if exists guard_group_shared_court_capacity on public.group_sessions;
update public.group_course_series s
set shared_activity_id='a7c3d9e1-4b62-4f80-9a15-2e6c8b0d7f31'::uuid
from public.profiles p
where p.id=s.coach_id
  and (
    (lower(p.email)='coacha@gmail.com' and s.audience='adultes' and s.weekday=2 and s.start_time=time '17:30' and s.end_time=time '20:30')
    or
    (lower(p.email)='coachb@gmail.com' and s.audience='adultes' and s.weekday=2 and s.start_time=time '19:00' and s.end_time=time '20:30')
  )
  and s.shared_activity_id is distinct from 'a7c3d9e1-4b62-4f80-9a15-2e6c8b0d7f31'::uuid;

update public.group_sessions g
set shared_activity_id='a7c3d9e1-4b62-4f80-9a15-2e6c8b0d7f31'::uuid
from public.profiles p
where p.id=g.coach_id
  and (
    (lower(p.email)='coacha@gmail.com' and g.audience='adultes' and extract(isodow from g.session_date)::integer=2 and g.start_time=time '17:30' and g.end_time=time '20:30')
    or
    (lower(p.email)='coachb@gmail.com' and g.audience='adultes' and extract(isodow from g.session_date)::integer=2 and g.start_time=time '19:00' and g.end_time=time '20:30')
  )
  and g.shared_activity_id is distinct from 'a7c3d9e1-4b62-4f80-9a15-2e6c8b0d7f31'::uuid;

-- Repair the denormalized ledger even if a trigger was absent during a previous backfill.
update public.shared_court_occupancy o
set shared_activity_id=g.shared_activity_id
from public.group_sessions g
where o.source_kind='group_session' and o.source_id=g.id
  and o.shared_activity_id is distinct from g.shared_activity_id;

create trigger guard_group_shared_court_capacity
before insert or update on public.group_sessions
for each row execute function private.guard_group_shared_court_capacity();
