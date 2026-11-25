-- Register push endpoints through a narrowly scoped, authenticated RPC.
-- This also handles an endpoint that was previously registered by another account
-- on the same device, without weakening table-level RLS policies.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_subscription jsonb,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_endpoint is null or length(trim(p_endpoint)) = 0
     or p_subscription is null
     or p_subscription->>'endpoint' is distinct from p_endpoint then
    raise exception 'Invalid push subscription' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (
    user_id, endpoint, subscription, user_agent, updated_at
  )
  values (
    v_user_id, p_endpoint, p_subscription, p_user_agent, pg_catalog.now()
  )
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        subscription = excluded.subscription,
        user_agent = excluded.user_agent,
        updated_at = pg_catalog.now();
end;
$$;

revoke all on function public.register_push_subscription(text, jsonb, text) from public;
revoke all on function public.register_push_subscription(text, jsonb, text) from anon;
grant execute on function public.register_push_subscription(text, jsonb, text) to authenticated;
