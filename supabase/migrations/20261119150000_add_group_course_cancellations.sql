create table if not exists public.group_course_cancellations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  audience text not null check (audience in ('adultes','enfants')),
  weekday smallint not null check (weekday between 1 and 6),
  reason text not null default 'Pluie',
  created_at timestamptz not null default now(),
  constraint group_course_cancellations_coach_date_audience_key unique (coach_id, session_date, audience)
);

create index if not exists group_course_cancellations_coach_date_idx
  on public.group_course_cancellations (coach_id, session_date);

alter table public.group_course_cancellations enable row level security;

grant select, insert, update, delete on public.group_course_cancellations to authenticated;

drop policy if exists "Coaches manage their own group course cancellations" on public.group_course_cancellations;
create policy "Coaches manage their own group course cancellations"
on public.group_course_cancellations
for all
to authenticated
using (
  coach_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
)
with check (
  coach_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
);
