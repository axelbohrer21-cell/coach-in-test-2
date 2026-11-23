begin;
alter function public.add_existing_player_to_coach(text) set schema private;
alter function public.cancel_private_booking(uuid) set schema private;
alter function public.invite_coach_to_player(uuid,text) set schema private;
alter function public.mark_coach_in_message_read(uuid) set schema private;
alter function public.notify_player_achievement_unlocked(uuid) set schema private;
alter function public.notify_player_existing_evaluation(uuid) set schema private;
alter function public.request_private_booking(uuid,date,time without time zone,integer,smallint) set schema private;
alter function public.respond_coach_player_invitation(uuid,boolean) set schema private;
alter function public.review_private_booking(uuid,text,text) set schema private;
alter function public.revoke_coach_player_invitation(uuid) set schema private;

grant usage on schema private to authenticated;
revoke all on function private.add_existing_player_to_coach(text) from public, anon;
revoke all on function private.cancel_private_booking(uuid) from public, anon;
revoke all on function private.invite_coach_to_player(uuid,text) from public, anon;
revoke all on function private.mark_coach_in_message_read(uuid) from public, anon;
revoke all on function private.notify_player_achievement_unlocked(uuid) from public, anon;
revoke all on function private.notify_player_existing_evaluation(uuid) from public, anon;
revoke all on function private.request_private_booking(uuid,date,time without time zone,integer,smallint) from public, anon;
revoke all on function private.respond_coach_player_invitation(uuid,boolean) from public, anon;
revoke all on function private.review_private_booking(uuid,text,text) from public, anon;
revoke all on function private.revoke_coach_player_invitation(uuid) from public, anon;

grant execute on function private.add_existing_player_to_coach(text) to authenticated;
grant execute on function private.cancel_private_booking(uuid) to authenticated;
grant execute on function private.invite_coach_to_player(uuid,text) to authenticated;
grant execute on function private.mark_coach_in_message_read(uuid) to authenticated;
grant execute on function private.notify_player_achievement_unlocked(uuid) to authenticated;
grant execute on function private.notify_player_existing_evaluation(uuid) to authenticated;
grant execute on function private.request_private_booking(uuid,date,time without time zone,integer,smallint) to authenticated;
grant execute on function private.respond_coach_player_invitation(uuid,boolean) to authenticated;
grant execute on function private.review_private_booking(uuid,text,text) to authenticated;
grant execute on function private.revoke_coach_player_invitation(uuid) to authenticated;

create function public.add_existing_player_to_coach(p_player_email text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.add_existing_player_to_coach(p_player_email); $$;
create function public.cancel_private_booking(p_request_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.cancel_private_booking(p_request_id); $$;
create function public.invite_coach_to_player(p_player_id uuid,p_coach_email text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.invite_coach_to_player(p_player_id,p_coach_email); $$;
create function public.mark_coach_in_message_read(p_message_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.mark_coach_in_message_read(p_message_id); $$;
create function public.notify_player_achievement_unlocked(p_achievement_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.notify_player_achievement_unlocked(p_achievement_id); $$;
create function public.notify_player_existing_evaluation(p_evaluation_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.notify_player_existing_evaluation(p_evaluation_id); $$;
create function public.request_private_booking(p_coach_id uuid,p_session_date date,p_start_time time without time zone,p_duration_minutes integer,p_court_number smallint)
returns uuid language sql security invoker set search_path = ''
as $$ select private.request_private_booking(p_coach_id,p_session_date,p_start_time,p_duration_minutes,p_court_number); $$;
create function public.respond_coach_player_invitation(p_invitation_id uuid,p_accept boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.respond_coach_player_invitation(p_invitation_id,p_accept); $$;
create function public.review_private_booking(p_request_id uuid,p_decision text,p_coach_note text)
returns void language sql security invoker set search_path = ''
as $$ select private.review_private_booking(p_request_id,p_decision,p_coach_note); $$;
create function public.revoke_coach_player_invitation(p_invitation_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.revoke_coach_player_invitation(p_invitation_id); $$;

create or replace function public.is_coach()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_coach(); $$;
create or replace function public.is_player()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_player(); $$;

revoke all on function public.add_existing_player_to_coach(text) from public, anon;
revoke all on function public.cancel_private_booking(uuid) from public, anon;
revoke all on function public.invite_coach_to_player(uuid,text) from public, anon;
revoke all on function public.mark_coach_in_message_read(uuid) from public, anon;
revoke all on function public.notify_player_achievement_unlocked(uuid) from public, anon;
revoke all on function public.notify_player_existing_evaluation(uuid) from public, anon;
revoke all on function public.request_private_booking(uuid,date,time without time zone,integer,smallint) from public, anon;
revoke all on function public.respond_coach_player_invitation(uuid,boolean) from public, anon;
revoke all on function public.review_private_booking(uuid,text,text) from public, anon;
revoke all on function public.revoke_coach_player_invitation(uuid) from public, anon;
revoke all on function public.is_coach() from public, anon;
revoke all on function public.is_player() from public, anon;

grant execute on function public.add_existing_player_to_coach(text) to authenticated;
grant execute on function public.cancel_private_booking(uuid) to authenticated;
grant execute on function public.invite_coach_to_player(uuid,text) to authenticated;
grant execute on function public.mark_coach_in_message_read(uuid) to authenticated;
grant execute on function public.notify_player_achievement_unlocked(uuid) to authenticated;
grant execute on function public.notify_player_existing_evaluation(uuid) to authenticated;
grant execute on function public.request_private_booking(uuid,date,time without time zone,integer,smallint) to authenticated;
grant execute on function public.respond_coach_player_invitation(uuid,boolean) to authenticated;
grant execute on function public.review_private_booking(uuid,text,text) to authenticated;
grant execute on function public.revoke_coach_player_invitation(uuid) to authenticated;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.is_player() to authenticated;
commit;
