-- Make public referral resolution read-only.
-- Only an authenticated active coach may create/rotate an invitation through
-- create_coach_referral_invite(); a public link lookup must never rotate tokens.
create or replace function public.resolve_coach_referral_link(p_link_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
begin
  select i.token::text
    into v_token
  from public.coach_referral_links l
  join public.coach_referral_invites i
    on i.id = l.current_invite_id
  join public.profiles p
    on p.id = l.sponsor_coach_id
  where l.id = p_link_id
    and p.role = 'coach'
    and p.archived_at is null
    and i.used_at is null
    and i.expires_at > now();

  return v_token;
end;
$function$;

revoke all on function public.resolve_coach_referral_link(uuid) from public;
grant execute on function public.resolve_coach_referral_link(uuid) to anon, authenticated;
