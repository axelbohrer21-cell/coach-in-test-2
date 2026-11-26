-- Static regression checks for the Planning Agent's database-backed calendar logic.
do $$
declare
  v_definition text;
  v_security_definer boolean;
begin
  select pg_get_functiondef(p.oid), p.prosecdef
    into v_definition, v_security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_private_booking_suggestions'
    and pg_get_function_identity_arguments(p.oid) = 'p_coach_id uuid, p_session_date date, p_duration_minutes integer';

  if v_definition is null then
    raise exception 'Planning Agent suggestion function is missing';
  end if;
  if v_security_definer then
    raise exception 'Planning Agent suggestion function must remain SECURITY INVOKER';
  end if;
  if position('public.shared_court_occupancy' in v_definition) = 0 then
    raise exception 'Planning Agent must read persisted shared court occupancy';
  end if;
  if position('5360a637-eed3-4201-87f0-437f67baffac' in v_definition) > 0 then
    raise exception 'Planning Agent must not contain a Coach B-specific UUID';
  end if;
  if position('COACH B' in upper(v_definition)) > 0 then
    raise exception 'Planning Agent must not contain Coach B-specific fallback logic';
  end if;
end;
$$;
