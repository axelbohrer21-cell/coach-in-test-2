create schema if not exists private;

create table if not exists public.coach_referral_links (
  id uuid primary key default gen_random_uuid(),
  sponsor_coach_id uuid not null unique references public.profiles(id) on delete cascade,
  current_invite_id uuid references public.coach_referral_invites(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_referral_links enable row level security;
revoke all on public.coach_referral_links from anon, authenticated, public;

insert into public.coach_referral_links (sponsor_coach_id, current_invite_id)
select p.id, invite.id
from public.profiles p
left join lateral (
  select i.id
  from public.coach_referral_invites i
  where i.sponsor_coach_id = p.id
    and i.used_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1
) invite on true
where p.role = 'coach' and p.archived_at is null
on conflict (sponsor_coach_id) do nothing;

create or replace function private.rotate_coach_referral_link(p_link_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_link public.coach_referral_links%rowtype;
  v_invite public.coach_referral_invites%rowtype;
  v_token uuid;
begin
  select * into v_link
  from public.coach_referral_links
  where id = p_link_id
  for update;

  if not found then return null; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_link.sponsor_coach_id
      and p.role = 'coach'
      and p.archived_at is null
  ) then
    return null;
  end if;

  select * into v_invite
  from public.coach_referral_invites
  where id = v_link.current_invite_id
  for update;

  if not found
     or v_invite.used_at is not null
     or v_invite.expires_at <= now() + interval '1 hour' then
    if found and v_invite.used_at is null then
      update public.coach_referral_invites
      set expires_at = now()
      where id = v_invite.id;
    end if;

    v_token := gen_random_uuid();
    insert into public.coach_referral_invites (token, sponsor_coach_id, expires_at)
    values (v_token, v_link.sponsor_coach_id, now() + interval '14 days')
    returning id into v_link.current_invite_id;

    update public.coach_referral_links
    set current_invite_id = v_link.current_invite_id,
        updated_at = now()
    where id = p_link_id;

    return v_token::text;
  end if;

  return v_invite.token::text;
end;
$function$;

revoke all on function private.rotate_coach_referral_link(uuid) from public, anon, authenticated;

create or replace function public.create_coach_referral_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_link_id uuid;
begin
  if v_user_id is null then
    raise exception 'Connexion requise.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.role = 'coach'
      and p.archived_at is null
  ) then
    raise exception 'Seul un coach actif peut parrainer un nouveau coach.';
  end if;

  insert into public.coach_referral_links (sponsor_coach_id)
  values (v_user_id)
  on conflict (sponsor_coach_id) do nothing;

  select id into v_link_id
  from public.coach_referral_links
  where sponsor_coach_id = v_user_id;

  perform private.rotate_coach_referral_link(v_link_id);
  return v_link_id::text;
end;
$function$;

revoke all on function public.create_coach_referral_invite() from public, anon;
grant execute on function public.create_coach_referral_invite() to authenticated;

create or replace function public.resolve_coach_referral_link(p_link_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return private.rotate_coach_referral_link(p_link_id);
end;
$function$;

revoke all on function public.resolve_coach_referral_link(uuid) from public;
grant execute on function public.resolve_coach_referral_link(uuid) to anon, authenticated;

create or replace function public.rotate_expiring_coach_referral_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_link record;
  v_rotated integer := 0;
  v_before text;
  v_after text;
begin
  for v_link in
    select id from public.coach_referral_links
  loop
    select i.token::text into v_before
    from public.coach_referral_links l
    left join public.coach_referral_invites i on i.id = l.current_invite_id
    where l.id = v_link.id;

    v_after := private.rotate_coach_referral_link(v_link.id);

    if v_after is not null and v_after is distinct from v_before then
      v_rotated := v_rotated + 1;
    end if;
  end loop;

  return v_rotated;
end;
$function$;

revoke all on function public.rotate_expiring_coach_referral_invites() from public, anon, authenticated;

do $schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'coach-referral-links-rotate-hourly'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'coach-referral-links-rotate-hourly',
    '0 * * * *',
    $$select public.rotate_expiring_coach_referral_invites();$$
  );
end;
$schedule$;
