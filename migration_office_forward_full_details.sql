-- =====================================================================
-- Council of Leaders Grievance System: migration
--   OFFICE FORWARDING — FULL CASE DETAILS
--
--   Previously, the email sent to a department/unit only contained the
--   subject + description, and the office's secure link (/office/:ref)
--   never revealed who filed the report at all. This migration adds the
--   full report — including the reporting student's identity — to both:
--     • the data returned to build the forwarding email
--     • the secure office portal (gc_office_get_case)
--
--   Anonymous submissions are still respected: feedback filed anonymously
--   (is_anonymous = true) still shows "Anonymous" instead of identity
--   fields. Formal complaints are never anonymous (enforced elsewhere),
--   so their reporter's identity is always included.
--
-- RUN ORDER: after migration_office_forwarding.sql (run once, safe to
-- re-run).
-- =====================================================================

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

-- ---------------------------------------------------------
-- Manual forward — same full-details payload as the auto version above.
-- ---------------------------------------------------------
create or replace function public.gc_set_office_forward(p_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_code  text;
  v_identity jsonb;
begin
  if not public.gc_is_staff() then raise exception 'Only Council staff can forward a case.'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email address.'; end if;

  select * into c from public.gc_complaints where id = p_id for update;
  if not found then raise exception 'Case not found.'; end if;

  v_code := coalesce(c.office_access_code, public.gc_generate_office_code());

  update public.gc_complaints
     set office_forward_email = v_email, office_access_code = v_code, office_forwarded_at = now()
   where id = p_id;

  insert into public.gc_updates (complaint_id, author_id, author_type, author_name, kind, message, is_public)
  values (p_id, auth.uid(), 'staff', public.gc_staff_name(auth.uid()), 'office_forward',
          'Manually forwarded to ' || v_email || ' (no office email was on file).', false);

  v_identity := case when c.is_anonymous then jsonb_build_object('is_anonymous', true) else jsonb_build_object(
    'is_anonymous', false,
    'complainant_name', c.complainant_name,
    'student_id', c.student_id,
    'complainant_email', c.email,
    'contact_no', c.contact_no,
    'program', c.program,
    'year_level', c.year_level
  ) end;

  return jsonb_build_object('to_email', v_email, 'code', v_code, 'reference_no', c.reference_no,
    'type', c.type,
    'department', c.office_department, 'unit', c.office_unit, 'concern', c.office_concern,
    'category', c.category, 'subcategory', c.subcategory,
    'incident_date', c.incident_date, 'incident_location', c.incident_location,
    'respondent', c.respondent, 'desired_outcome', c.desired_outcome,
    'submitted_at', c.submitted_at)
    || v_identity;
end $$;
revoke all on function public.gc_set_office_forward(uuid, text) from public, anon;
grant execute on function public.gc_set_office_forward(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- Secure office portal (/office/:ref) — show the same full details there
-- too, so the office isn't missing anything the forwarding email had.
-- ---------------------------------------------------------
create or replace function public.gc_office_get_case(p_ref text, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.gc_complaints;
begin
  c := public.gc_find_complaint_by_ref(p_ref);
  if c.id is null or c.office_access_code is null
     or c.office_access_code <> btrim(coalesce(p_code,'')) then
    return null; -- wrong ref or wrong code: reveal nothing
  end if;

  return jsonb_build_object(
    'reference_no', c.reference_no,
    'type', c.type,
    'status', c.status,
    'is_anonymous', c.is_anonymous,
    'complainant_name', case when c.is_anonymous then null else c.complainant_name end,
    'student_id', case when c.is_anonymous then null else c.student_id end,
    'complainant_email', case when c.is_anonymous then null else c.email end,
    'contact_no', case when c.is_anonymous then null else c.contact_no end,
    'program', case when c.is_anonymous then null else c.program end,
    'year_level', case when c.is_anonymous then null else c.year_level end,
    'department', c.office_department, 'unit', c.office_unit, 'concern', c.office_concern,
    'subject', c.subject,
    'description', c.description,
    'respondent', c.respondent,
    'desired_outcome', c.desired_outcome,
    'incident_date', c.incident_date,
    'incident_location', c.incident_location,
    'submitted_at', c.submitted_at,
    'resolution_summary', c.resolution_summary,
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', u.kind, 'author', case u.author_type
                 when 'office' then 'Your office' when 'staff' then 'Council of Leaders'
                 when 'complainant' then 'Complainant' else 'System' end,
               'message', u.message, 'created_at', u.created_at) order by u.created_at)
      from public.gc_updates u
      where u.complaint_id = c.id and u.kind in ('office_forward','office_update','status_change','public_response')
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.gc_office_get_case(text, text) from public, anon, authenticated;
grant execute on function public.gc_office_get_case(text, text) to anon, authenticated;
