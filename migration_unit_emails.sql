-- =====================================================================
-- Council of Leaders Grievance System: migration
--   Unit email + unit head email
--
--   • Each unit (e.g. "IT Services Office") can now have an office email
--     and a unit head email, editable by admins in Offices & Concerns.
--   • Both are optional. If a submission's unit has neither on file, staff
--     see a clear "no email on file — follow up manually" notice on the
--     ticket (handled in the app; this migration just stores the data).
--
-- RUN ORDER: schema.sql -> migration_categories_validation.sql ->
--            migration_office_routing.sql -> THIS FILE
-- Safe to run more than once.
-- =====================================================================

alter table public.gc_units add column if not exists email      text;
alter table public.gc_units add column if not exists head_email text;

alter table public.gc_units drop constraint if exists gc_units_email_check;
alter table public.gc_units add  constraint gc_units_email_check
  check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

alter table public.gc_units drop constraint if exists gc_units_head_email_check;
alter table public.gc_units add  constraint gc_units_head_email_check
  check (head_email is null or head_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Existing RLS on gc_units (staff read, admin write) already covers these new
-- columns — nothing else to grant.
