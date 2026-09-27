-- =====================================================================
-- Council of Leaders Grievance System: migration
--   CONFIDENTIAL COMPLAINTS
--
--   • Students filing a formal Complaint can check "Mark as Confidential".
--   • When checked:
--       - Council staff who are NOT admins can still see the case in
--         their list/detail (reference no., status, priority, dates) but
--         CANNOT see the subject, description, identity, evidence, or
--         timeline messages.
--       - Admins can still see everything, as before.
--       - The concerned OFFICE (via its secure /office/:ref + 4-digit
--         code link — unchanged by this migration) continues to see the
--         full case, and can now change the status themselves
--         (previously only Council staff could change status).
--   • Non-confidential complaints/feedback behave exactly as before.
--
-- RUN ORDER: after migration_office_redirect_request.sql (needs
-- gc_find_complaint_by_ref, gc_office_get_case, office access codes).
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------
alter table public.gc_complaints add column if not exists is_confidential boolean not null default false;
create index if not exists gc_complaints_confidential_idx on public.gc_complaints(is_confidential);

-- ---------------------------------------------------------
-- 2. Submit complaint: accept is_confidential (complaints only —
--    feedback has its own anonymity option and is unaffected).
-- ---------------------------------------------------------
create or replace function public.gc_submit_complaint(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_anon        boolean := coalesce((p->>'is_anonymous')::boolean, false);
  v_confidential boolean := coalesce((p->>'is_confidential')::boolean, false);
  v_sid       uuid    := nullif(p->>'submission_id','')::uuid;
  v_concern   uuid    := nullif(btrim(coalesce(p->>'concern_id','')),'')::uuid;
  v_unsure    boolean := coalesce((p->>'office_unsure')::boolean, false);
  v_student   text    := btrim(coalesce(p->>'student_id',''));
  v_flag      boolean := false;
  v_subject   text    := btrim(coalesce(p->>'subject',''));
  v_desc      text    := btrim(coalesce(p->>'description',''));
  v_name      text    := nullif(btrim(coalesce(p->>'complainant_name','')), '');
  v_email     text    := nullif(btrim(coalesce(p->>'email','')), '');
  v_id        uuid;
  v_code      text;
  v_att       jsonb;
  v_att_count int := 0;
  v_did uuid; v_dname text; v_uid uuid; v_uname text; v_cid uuid; v_cname text;
begin
  if v_concern is not null then
    select d.id as did, d.name as dname, u.id as uid, u.name as uname, c.id as cid, c.name as cname
      into v_did, v_dname, v_uid, v_uname, v_cid, v_cname
      from public.gc_concerns c
      join public.gc_units u on u.id = c.unit_id
      join public.gc_departments d on d.id = u.department_id
     where c.id = v_concern and c.is_active and u.is_active and d.is_active;
    if not found then raise exception 'Please choose a valid department, unit and concern.'; end if;
  elsif not v_unsure then
    raise exception 'Please choose a department, unit and concern.';
  end if;

  if char_length(v_subject) < 5 or char_length(v_subject) > 200 then
    raise exception 'Subject must be between 5 and 200 characters.';
  end if;
  if char_length(v_desc) < 20 or char_length(v_desc) > 5000 then
    raise exception 'Description must be between 20 and 5000 characters.';
  end if;
  if v_anon then
    raise exception 'Formal complaints require identification. To stay anonymous, submit Feedback instead.';
  end if;
  if v_name is null then raise exception 'Please provide your full name.'; end if;
  if v_student !~ '^20[0-9]{2}-[0-9]{6,7}$' then
    raise exception 'Student ID must follow this format: 20XX-XXXXXX or 20XX-XXXXXXX (e.g. 2024-123456).';
  end if;
  if v_email is null or v_email !~* '^[^@[:space:]]+@(students\.)?nu-laguna\.edu\.ph$' then
    raise exception 'Please use your NU email (@students.nu-laguna.edu.ph or @nu-laguna.edu.ph) so a representative can reach you on Microsoft Teams.';
  end if;
  if jsonb_typeof(coalesce(p->'attachments','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p->'attachments','[]'::jsonb)) > 3 then
    raise exception 'You can attach up to 3 files.';
  end if;

  v_flag := public.gc_has_profanity(concat_ws(' ', v_subject, v_desc, p->>'respondent', p->>'desired_outcome'));
  v_code := public.gc_generate_tracking_code();

  insert into public.gc_complaints (
    reference_no, tracking_code, is_anonymous, is_confidential,
    complainant_name, student_id, email, contact_no, program, year_level,
    department_id, unit_id, concern_id, office_department, office_unit, office_concern, office_unsure,
    category, subcategory, flagged_language, subject, description, incident_date, incident_location, respondent, desired_outcome
  ) values (
    public.gc_next_reference('GC'), v_code, false, v_confidential,
    left(v_name, 150),
    v_student,
    left(lower(v_email), 200),
    left(nullif(btrim(coalesce(p->>'contact_no','')), ''), 50),
    left(nullif(btrim(coalesce(p->>'program','')), ''), 150),
    left(nullif(btrim(coalesce(p->>'year_level','')), ''), 50),
    v_did, v_uid, v_cid, v_dname, v_uname, v_cname, v_unsure,
    coalesce(v_dname, 'Unrouted'), v_cname, v_flag, v_subject, v_desc,
    nullif(p->>'incident_date','')::date,
    left(nullif(btrim(coalesce(p->>'incident_location','')), ''), 200),
    left(nullif(btrim(coalesce(p->>'respondent','')), ''), 200),
    left(nullif(btrim(coalesce(p->>'desired_outcome','')), ''), 1000)
  ) returning id into v_id;

  for v_att in select * from jsonb_array_elements(coalesce(p->'attachments','[]'::jsonb)) loop
    if v_sid is not null and (v_att->>'path') like 'submissions/' || v_sid::text || '/%' then
      insert into public.gc_attachments (complaint_id, storage_path, file_name, mime_type, size_bytes)
      values (v_id, v_att->>'path', left(coalesce(v_att->>'name','file'), 200),
              left(v_att->>'type', 100), nullif(v_att->>'size','')::bigint);
      v_att_count := v_att_count + 1;
    end if;
  end loop;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (v_id, 'system', 'System', 'submitted',
          'Complaint received' || case when v_att_count > 0 then ' with ' || v_att_count || ' attachment(s)' else '' end
          || case when v_confidential then ' (marked confidential).'
                  when v_dname is not null then ' and sent to ' || v_dname || ' › ' || v_uname || '.'
                  else '. It will be routed to the right office by the Council.' end,
          true);

  return v_code;
end $$;
grant execute on function public.gc_submit_complaint(jsonb) to anon, authenticated;

-- ---------------------------------------------------------
-- 3. Redacted staff view.
--    Owned by the migration-runner (postgres), which bypasses RLS, so
--    this view can see every row while still deciding — per viewer,
--    via gc_is_admin()/gc_is_staff() which read the CALLER's session —
--    what to reveal. Non-admin staff get the row (status, priority,
--    routing, dates) but every content/identity field comes back null
--    when the case is confidential.
-- ---------------------------------------------------------
create or replace view public.gc_staff_complaints as
select
  id, type, reference_no, tracking_code, is_anonymous, is_confidential,
  status, priority, assigned_to, forwarded_to,
  category, subcategory, department_id, unit_id, concern_id,
  office_department, office_unit, office_concern, office_unsure, feedback_type,
  flagged_language,
  redirect_requested_concern_id, redirect_requested_label, redirect_requested_reason, redirect_requested_at,
  office_forward_email, office_forwarded_at,
  satisfaction_rating, satisfaction_comment,
  submitted_at, updated_at, resolved_at, closed_at,
  (select count(*) from public.gc_attachments a where a.complaint_id = gc_complaints.id) as attachment_count,
  case when is_confidential and not public.gc_is_admin() then null else complainant_name  end as complainant_name,
  case when is_confidential and not public.gc_is_admin() then null else student_id        end as student_id,
  case when is_confidential and not public.gc_is_admin() then null else email             end as email,
  case when is_confidential and not public.gc_is_admin() then null else contact_no        end as contact_no,
  case when is_confidential and not public.gc_is_admin() then null else program           end as program,
  case when is_confidential and not public.gc_is_admin() then null else year_level        end as year_level,
  case when is_confidential and not public.gc_is_admin() then null else subject           end as subject,
  case when is_confidential and not public.gc_is_admin() then null else description       end as description,
  case when is_confidential and not public.gc_is_admin() then null else incident_date     end as incident_date,
  case when is_confidential and not public.gc_is_admin() then null else incident_location end as incident_location,
  case when is_confidential and not public.gc_is_admin() then null else respondent        end as respondent,
  case when is_confidential and not public.gc_is_admin() then null else desired_outcome   end as desired_outcome,
  case when is_confidential and not public.gc_is_admin() then null else resolution_summary end as resolution_summary,
  case when is_confidential and not public.gc_is_admin() then null else office_access_code end as office_access_code
from public.gc_complaints
where public.gc_is_staff();

grant select on public.gc_staff_complaints to authenticated;
revoke all on public.gc_staff_complaints from anon;

-- ---------------------------------------------------------
-- 4. RLS: lock the base table down for confidential rows.
--    Non-admin staff lose direct table access to a confidential row's
--    columns entirely (they only ever see it through the redacted view
--    above, or not at all if they query the base table directly), and
--    cannot update a confidential complaint (only admins, or the office
--    via the RPC in section 6, can).
-- ---------------------------------------------------------
drop policy if exists "gc complaints: staff read"   on public.gc_complaints;
drop policy if exists "gc complaints: staff update" on public.gc_complaints;
create policy "gc complaints: staff read" on public.gc_complaints for select to authenticated
  using (public.gc_is_staff() and (not is_confidential or public.gc_is_admin()));
create policy "gc complaints: staff update" on public.gc_complaints for update to authenticated
  using (public.gc_is_staff() and (not is_confidential or public.gc_is_admin()))
  with check (public.gc_is_staff() and (not is_confidential or public.gc_is_admin()));

-- gc_updates / gc_attachments: same confidentiality gate for non-admins.
drop policy if exists "gc updates: staff read"   on public.gc_updates;
drop policy if exists "gc updates: staff insert" on public.gc_updates;
create policy "gc updates: staff read" on public.gc_updates for select to authenticated
  using (
    public.gc_is_staff()
    and exists (select 1 from public.gc_complaints c where c.id = complaint_id and (not c.is_confidential or public.gc_is_admin()))
  );
create policy "gc updates: staff insert" on public.gc_updates for insert to authenticated
  with check (
    public.gc_is_staff()
    and author_id = auth.uid()
    and author_type = 'staff'
    and kind in ('public_response','internal_note')
    and exists (select 1 from public.gc_complaints c where c.id = complaint_id and (not c.is_confidential or public.gc_is_admin()))
  );

drop policy if exists "gc attachments: staff read" on public.gc_attachments;
create policy "gc attachments: staff read" on public.gc_attachments for select to authenticated
  using (
    public.gc_is_staff()
    and exists (select 1 from public.gc_complaints c where c.id = complaint_id and (not c.is_confidential or public.gc_is_admin()))
  );

-- Evidence storage: same gate, joined from the object's own path.
drop policy if exists "gc evidence: staff read" on storage.objects;
create policy "gc evidence: staff read" on storage.objects for select to authenticated
  using (
    bucket_id = 'gc-evidence' and public.gc_is_staff()
    and exists (
      select 1 from public.gc_attachments a
      join public.gc_complaints c on c.id = a.complaint_id
      where a.storage_path = storage.objects.name
        and (not c.is_confidential or public.gc_is_admin())
    )
  );

-- ---------------------------------------------------------
-- 5. Office portal also shows is_confidential (so the office knows the
--    normal rule doesn't hide anything from THEM) — no data changes
--    needed since gc_office_get_case already returns the full case
--    regardless of confidentiality; just add the flag for the UI.
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
    'is_confidential', c.is_confidential,
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

-- ---------------------------------------------------------
-- 6. Office updates the status itself (confidential complaints only —
--    on a non-confidential case Council staff still own the status).
--    Reuses the existing before/after-update triggers, so timestamps
--    (resolved_at/closed_at) and the public status_change timeline
--    entry are written automatically, exactly as when staff change it.
-- ---------------------------------------------------------
create or replace function public.gc_office_update_status(p_ref text, p_code text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
begin
  c := public.gc_find_complaint_by_ref(p_ref);
  if c.id is null or c.office_access_code is null
     or c.office_access_code <> btrim(coalesce(p_code,'')) then
    raise exception 'Invalid case or code.';
  end if;
  if c.type <> 'complaint' then
    raise exception 'Only complaints have a status your office can change here.';
  end if;
  if not c.is_confidential then
    raise exception 'This case is not confidential — please let the Council know and they will update its status.';
  end if;
  if p_status not in ('under_review','in_progress','resolved','closed') then
    raise exception 'Choose a valid status.';
  end if;

  update public.gc_complaints set status = p_status where id = c.id;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (c.id, 'office', coalesce(c.office_unit, 'Office'), 'office_update',
          'Status updated to ' || p_status || ' by the concerned office.', false);

  if c.email is not null then
    return jsonb_build_object('notify', true, 'to_email', c.email, 'name', c.complainant_name,
      'tracking_code', c.tracking_code, 'status_key', p_status);
  end if;
  return jsonb_build_object('notify', false);
end $$;
revoke all on function public.gc_office_update_status(text, text, text) from public, anon, authenticated;
grant execute on function public.gc_office_update_status(text, text, text) to anon, authenticated;
