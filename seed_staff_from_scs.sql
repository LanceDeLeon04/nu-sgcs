-- =========================================================
-- OPTIONAL — run AFTER schema.sql
--
-- Copies the SCS File Repository's admin accounts (public.profiles
-- where role = 'admin') into gc_staff as complaint-system ADMINS,
-- so they can sign in to the Council of Leaders complaints system
-- with the same email + password they already use.
--
-- This only READS public.profiles; it never modifies it.
-- Safe to re-run. Skips itself if the SCS profiles table isn't there.
-- =========================================================
do $$
begin
  if to_regclass('public.profiles') is null then
    raise notice 'public.profiles not found — nothing to copy. Use npm run create-staff instead.';
    return;
  end if;

  insert into public.gc_staff (user_id, full_name, email, position, role, is_active)
  select p.id, p.name, p.email, p.position, 'admin', true
  from public.profiles p
  where p.role = 'admin'
  on conflict (user_id) do nothing;
end $$;

select user_id, full_name, email, position, role from public.gc_staff order by created_at;
