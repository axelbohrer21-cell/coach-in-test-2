-- Keep the coach role and grant the same account administrator capabilities.
alter table public.profiles add column if not exists is_admin boolean not null default false;
update public.profiles set is_admin = true where lower(email) = 'axel.bohrer21@gmail.com';
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.is_admin = true or p.role = 'admin')
      and p.archived_at is null
  );
$fn$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
