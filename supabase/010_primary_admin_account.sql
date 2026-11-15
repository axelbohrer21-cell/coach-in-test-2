-- COACH IN — compte administrateur principal
-- L'adresse autorisée est fixée à la demande du propriétaire du projet.
-- Seule une création de compte Auth avec cette adresse exacte reçoit le rôle admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id,email,first_name,last_name,role)
  values (
    new.id,
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data ->> 'first_name',''),
    coalesce(new.raw_user_meta_data ->> 'last_name',''),
    case
      when lower(coalesce(new.email,'')) = 'axel.bohrer21@gmail.com' then 'admin'
      else 'player'
    end
  )
  on conflict (id) do update
    set email=excluded.email,
        role=case
          when lower(coalesce(new.email,'')) = 'axel.bohrer21@gmail.com' then 'admin'
          else public.profiles.role
        end;
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists profiles_admin_select_coaches on public.profiles;
create policy profiles_admin_select_coaches
on public.profiles
for select
to authenticated
using (public.is_admin() and role = 'coach');
