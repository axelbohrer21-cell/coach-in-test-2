-- Retire l'accès anonyme au helper utilisé par la politique de lecture admin.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
