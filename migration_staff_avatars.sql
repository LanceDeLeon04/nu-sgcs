-- =====================================================================
-- Council of Leaders Grievance System: migration
--   STAFF PROFILE PICTURES
--
--   Lets each staff member upload / replace / remove their own profile
--   picture from Settings. Pictures live in a PRIVATE bucket
--   (gc-avatars), one folder per user, and are shown to signed-in staff
--   via short-lived signed URLs. Non-admins can't UPDATE gc_staff
--   directly, so the path is saved through a SECURITY DEFINER function
--   that only ever touches the caller's own row.
--
-- RUN ORDER: after migration_evidence_required.sql. Safe to run more
-- than once.
-- =====================================================================

alter table public.gc_staff add column if not exists avatar_path text;

-- Private bucket, 1 MB cap (the app resizes to 256x256 before upload).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gc-avatars', 'gc-avatars', false, 1048576,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

drop policy if exists "gc avatars: staff read"       on storage.objects;
drop policy if exists "gc avatars: own upload"       on storage.objects;
drop policy if exists "gc avatars: own update"       on storage.objects;
drop policy if exists "gc avatars: own delete"       on storage.objects;

-- Any active staff member can view avatars.
create policy "gc avatars: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'gc-avatars' and public.gc_is_staff());

-- Staff can only write inside their own folder: <user_id>/<file>
create policy "gc avatars: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'gc-avatars' and public.gc_is_staff()
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gc avatars: own update" on storage.objects for update to authenticated
  using (bucket_id = 'gc-avatars' and public.gc_is_staff()
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'gc-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gc avatars: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'gc-avatars' and public.gc_is_staff()
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Save (or clear, with null) the caller's own avatar path.
create or replace function public.gc_set_my_avatar(p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.gc_is_staff() then
    raise exception 'Not authorized';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> auth.uid()::text then
    raise exception 'Invalid avatar path';
  end if;
  update public.gc_staff set avatar_path = p_path where user_id = auth.uid();
end $$;

revoke all on function public.gc_set_my_avatar(text) from public, anon;
grant execute on function public.gc_set_my_avatar(text) to authenticated;
