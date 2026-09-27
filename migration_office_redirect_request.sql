-- =====================================================================
-- Council of Leaders Grievance System: migration
--   OFFICE-INITIATED REDIRECT REQUEST
--
--   Lets the office on the receiving end of a forward (the secure
--   /office/:ref portal — not a Council staff account) flag that a case
--   was wrongly routed to them and request that it be sent to a
--   different department/unit/concern instead. A reason is required.
--
--   This does NOT move the case by itself — an office can't reassign
--   a case without Council review. It records the request and surfaces
--   it to staff, who can accept it (one click, pre-filled) or dismiss it.
--
-- RUN ORDER: after migration_office_forward_full_details.sql. Safe to
-- run more than once.
-- =====================================================================

-- ---------------------------------------------------------
-- 1. Columns on gc_complaints for the pending request (one at a time —
--    a new request overwrites the previous one; reassigning or
--    dismissing clears it).
-- ---------------------------------------------------------
alter table public.gc_complaints add column if not exists redirect_requested_concern_id uuid references public.gc_concerns(id) on delete set null;
alter table public.gc_complaints add column if not exists redirect_requested_label      text;
alter table public.gc_complaints add column if not exists redirect_requested_reason     text;
alter table public.gc_complaints add column if not exists redirect_requested_at         timestamptz;

alter table public.gc_complaints drop constraint if exists gc_complaints_redirect_reason_check;
alter table public.gc_complaints add  constraint gc_complaints_redirect_reason_check
  check (redirect_requested_reason is null or char_length(btrim(redirect_requested_reason)) between 10 and 1000);

-- ---------------------------------------------------------
-- 2. New timeline entry kind
-- ---------------------------------------------------------
alter table public.gc_updates drop constraint if exists gc_updates_kind_check;
alter table public.gc_updates add  constraint gc_updates_kind_check check (kind in (
  'submitted','status_change','assignment','priority_change',
  'public_response','internal_note','follow_up','reassignment',
  'office_forward','office_update','office_redirect_request'));
-- office_redirect_request is internal (staff-only) by default, same as
-- office_forward/office_update — no change needed to
-- gc_updates_before_insert(), which already only makes the listed public
-- kinds visible to the complainant.

-- ---------------------------------------------------------
-- 3. Office requests a redirect. Requires the same 4-digit code as the
--    rest of the office portal, and a written reason.
-- ---------------------------------------------------------
create or replace function public.gc_office_request_redirect(p_ref text, p_code text, p_concern_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
  r record;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  c := public.gc_find_complaint_by_ref(p_ref);
  if c.id is null or c.office_access_code is null
     or c.office_access_code <> btrim(coalesce(p_code,'')) then
    raise exception 'Invalid case or code.';
  end if;

  if char_length(v_reason) < 10 then
    raise exception 'Please explain why this should go to a different office (at least 10 characters).';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Please keep the reason under 1000 characters.';
  end if;

  select d.id as did, d.name as dname, u.id as uid, u.name as uname, k.id as cid, k.name as cname
    into r
    from public.gc_concerns k
    join public.gc_units u on u.id = k.unit_id
    join public.gc_departments d on d.id = u.department_id
   where k.id = p_concern_id and k.is_active and u.is_active and d.is_active;
  if not found then raise exception 'Choose an active department, unit and concern.'; end if;

  if c.concern_id is not distinct from r.cid then
    raise exception 'This case is already routed there.';
  end if;

  update public.gc_complaints
     set redirect_requested_concern_id = r.cid,
         redirect_requested_label      = concat_ws(' › ', r.dname, r.uname, r.cname),
         redirect_requested_reason     = v_reason,
         redirect_requested_at         = now()
   where id = c.id;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (c.id, 'office', coalesce(c.office_unit, 'Office'), 'office_redirect_request',
          'Requested redirect to ' || concat_ws(' › ', r.dname, r.uname, r.cname) || '. Reason: ' || v_reason, false);

  return jsonb_build_object('label', concat_ws(' › ', r.dname, r.uname, r.cname), 'reference_no', c.reference_no);
end $$;
revoke all on function public.gc_office_request_redirect(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.gc_office_request_redirect(text, text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------
-- 4. Staff dismisses a redirect request without acting on it (e.g. the
--    office was actually right and staff will handle it another way).
-- ---------------------------------------------------------
create or replace function public.gc_dismiss_redirect_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.gc_is_staff() then raise exception 'Only Council staff can dismiss a redirect request.'; end if;

  update public.gc_complaints
     set redirect_requested_concern_id = null,
         redirect_requested_label      = null,
         redirect_requested_reason     = null,
         redirect_requested_at         = null
   where id = p_id;

  insert into public.gc_updates (complaint_id, author_id, author_type, author_name, kind, message, is_public)
  values (p_id, auth.uid(), 'staff', public.gc_staff_name(auth.uid()), 'internal_note',
          'Dismissed the office''s redirect request; keeping the current routing.', false);
end $$;
revoke all on function public.gc_dismiss_redirect_request(uuid) from public, anon;
grant execute on function public.gc_dismiss_redirect_request(uuid) to authenticated;

-- ---------------------------------------------------------
-- 5. Reassigning a case (accepting the office's suggestion or routing it
--    anywhere else) always clears any pending redirect request.
-- ---------------------------------------------------------
create or replace function public.gc_reassign_complaint(p_id uuid, p_concern_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c      public.gc_complaints;
  r      record;
  v_old  text;
  v_new  text;
  v_note text := left(nullif(btrim(coalesce(p_note,'')), ''), 500);
begin
  if not public.gc_is_admin() then raise exception 'Only admins can change the office of a concern.'; end if;

  select * into c from public.gc_complaints where id = p_id for update;
  if not found then raise exception 'Submission not found.'; end if;

  select d.id as did, d.name as dname, u.id as uid, u.name as uname, k.id as cid, k.name as cname
    into r
    from public.gc_concerns k
    join public.gc_units u on u.id = k.unit_id
    join public.gc_departments d on d.id = u.department_id
   where k.id = p_concern_id and k.is_active and u.is_active and d.is_active;
  if not found then raise exception 'Choose an active department, unit and concern.'; end if;

  if c.concern_id is not distinct from r.cid then
    raise exception 'This is already routed to that department, unit and concern.';
  end if;

  v_old := case
    when c.office_department is not null then concat_ws(' › ', c.office_department, c.office_unit, c.office_concern)
    when c.office_unsure then 'Not yet routed'
    else concat_ws(' › ', c.category, c.subcategory) end;
  v_new := concat_ws(' › ', r.dname, r.uname, r.cname);

  update public.gc_complaints
     set department_id = r.did, unit_id = r.uid, concern_id = r.cid,
         office_department = r.dname, office_unit = r.uname, office_concern = r.cname,
         category = r.dname, subcategory = r.cname,
         redirect_requested_concern_id = null, redirect_requested_label = null,
         redirect_requested_reason = null, redirect_requested_at = null
   where id = p_id;

  insert into public.gc_updates (complaint_id, author_id, author_type, author_name, kind, message)
  values (p_id, auth.uid(), 'staff', public.gc_staff_name(auth.uid()), 'reassignment',
          'Routed to ' || v_new || ' (previously: ' || v_old || ').' || coalesce(' Note: ' || v_note, ''));

  return jsonb_build_object('new_label', v_new, 'old_label', v_old);
end $$;
revoke all on function public.gc_reassign_complaint(uuid, uuid, text) from public, anon;
grant execute on function public.gc_reassign_complaint(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------
-- 6. Secure office portal: show the office its own pending request (if
--    any), and include the new update kind in the case history.
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
    'redirect_requested_label', c.redirect_requested_label,
    'redirect_requested_reason', c.redirect_requested_reason,
    'redirect_requested_at', c.redirect_requested_at,
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', u.kind, 'author', case u.author_type
                 when 'office' then 'Your office' when 'staff' then 'Council of Leaders'
                 when 'complainant' then 'Complainant' else 'System' end,
               'message', u.message, 'created_at', u.created_at) order by u.created_at)
      from public.gc_updates u
      where u.complaint_id = c.id and u.kind in ('office_forward','office_update','status_change','public_response','office_redirect_request')
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.gc_office_get_case(text, text) from public, anon, authenticated;
grant execute on function public.gc_office_get_case(text, text) to anon, authenticated;
