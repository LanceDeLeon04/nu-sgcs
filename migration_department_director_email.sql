-- =====================================================================
-- Council of Leaders Grievance System: migration
--   REQUIRED DIRECTOR EMAIL FOR EVERY DEPARTMENT
--
--   • gc_departments.director_email — every department must have one.
--   • New departments can't be created without it, and an existing
--     department can't be saved while it's blank (enforced by a CHECK).
--   • The director is NOT copied on individual cases. Instead they get ONE
--     weekly summary email every Friday (api/cron-weekly-digest.js).
--   • gc_digest_log records each digest sent so a retried cron never sends
--     the same week's summary twice.
--
-- RUN ORDER: after migration_office_forward_full_details.sql
--            (and migration_unit_emails.sql). Safe to run more than once.
-- =====================================================================

alter table public.gc_departments add column if not exists director_email text;

-- No backfill on purpose: the director now receives a weekly summary of the
-- whole department, so the address must be entered deliberately by an admin
-- (Offices & Concerns), not guessed from a unit head email.

-- Required + valid format. NOT VALID = enforced for every new/changed row
-- right away without failing the migration on departments that are still blank.
alter table public.gc_departments drop constraint if exists gc_departments_director_email_check;
alter table public.gc_departments add  constraint gc_departments_director_email_check
  check (director_email is not null and director_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') not valid;

-- Once every department has one, lock it in fully.
do $$
begin
  if not exists (select 1 from public.gc_departments where director_email is null or btrim(director_email) = '') then
    alter table public.gc_departments validate constraint gc_departments_director_email_check;
  end if;
end $$;

-- Existing RLS on gc_departments (staff read, admin write) already covers the new column.


-- ---------------------------------------------------------
-- Weekly digest log (one row per department per week)
-- ---------------------------------------------------------
create table if not exists public.gc_digest_log (
  department_id uuid not null references public.gc_departments(id) on delete cascade,
  week_start    date not null,
  sent_to       text not null,
  item_count    int  not null default 0,
  sent_at       timestamptz not null default now(),
  primary key (department_id, week_start)
);
alter table public.gc_digest_log enable row level security;
revoke all on public.gc_digest_log from anon, authenticated;
-- No policies: only the server-side cron (service role) reads/writes this.

-- ---------------------------------------------------------
-- Restore per-case forwarding to the original behaviour (unit email, else
-- unit head email, else manual). Safe whether or not an earlier version of
-- this file changed it.
-- ---------------------------------------------------------
create or replace function public.gc_get_office_forward(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
  u record;
  v_email text;
  v_code  text;
  v_identity jsonb;
begin
  c := public.gc_find_complaint_by_ref(p_ref);
  if c.id is null then raise exception 'Case not found.'; end if;

  if c.unit_id is null then
    return jsonb_build_object('needs_manual', true, 'reason', 'unrouted');
  end if;

  select id, name, email, head_email into u from public.gc_units where id = c.unit_id;
  v_email := coalesce(u.email, u.head_email);

  v_identity := case when c.is_anonymous then jsonb_build_object('is_anonymous', true) else jsonb_build_object(
    'is_anonymous', false,
    'complainant_name', c.complainant_name,
    'student_id', c.student_id,
    'complainant_email', c.email,
    'contact_no', c.contact_no,
    'program', c.program,
    'year_level', c.year_level
  ) end;

  if v_email is null then
    return jsonb_build_object('needs_manual', true, 'reason', 'no_email', 'unit_name', u.name) || v_identity;
  end if;

  -- Already forwarded to this exact address: don't re-send, just return the
  -- existing code so the caller can no-op.
  if c.office_forward_email is not distinct from v_email and c.office_access_code is not null then
    return jsonb_build_object(
      'already_sent', true, 'to_email', v_email, 'code', c.office_access_code,
      'reference_no', c.reference_no, 'unit_name', u.name)
      || v_identity;
  end if;

  v_code := public.gc_generate_office_code();
  update public.gc_complaints
     set office_forward_email = v_email, office_access_code = v_code, office_forwarded_at = now()
   where id = c.id;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (c.id, 'system', 'System', 'office_forward', 'Automatically forwarded to ' || u.name || ' (' || v_email || ').', false);

  return jsonb_build_object(
    'to_email', v_email, 'code', v_code, 'reference_no', c.reference_no,
    'unit_name', u.name, 'needs_manual', false,
    'type', c.type,
    'department', c.office_department, 'unit', c.office_unit, 'concern', c.office_concern,
    'category', c.category, 'subcategory', c.subcategory,
    'incident_date', c.incident_date, 'incident_location', c.incident_location,
    'respondent', c.respondent, 'desired_outcome', c.desired_outcome,
    'submitted_at', c.submitted_at)
    || v_identity;
end $$;
revoke all on function public.gc_get_office_forward(text) from public, anon, authenticated;
grant execute on function public.gc_get_office_forward(text) to anon, authenticated;
