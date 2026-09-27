-- =====================================================================
-- Council of Leaders Grievance System: migration
--   EVIDENCE REQUIRED ON COMPLAINTS
--
--   Formal complaints must now include at least one evidence attachment
--   (1-3 files). Feedback is unaffected (still optional/no attachments).
--   This is a server-side backstop for the UI, which already requires it.
--
-- RUN ORDER: after migration_confidential_complaints.sql. Safe to run
-- more than once.
-- =====================================================================

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
     or jsonb_array_length(coalesce(p->'attachments','[]'::jsonb)) < 1 then
    raise exception 'Please attach at least one file as evidence.';
  end if;
  if jsonb_array_length(coalesce(p->'attachments','[]'::jsonb)) > 3 then
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

  -- Every attachment must have actually been uploaded under this submission's
  -- own folder (matched above) — if none matched, the "evidence" claimed in
  -- the payload wasn't real, so this is treated the same as no evidence.
  if v_att_count < 1 then
    raise exception 'Please attach at least one file as evidence.';
  end if;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (v_id, 'system', 'System', 'submitted',
          'Complaint received with ' || v_att_count || ' attachment(s)'
          || case when v_confidential then ' (marked confidential).'
                  when v_dname is not null then ' and sent to ' || v_dname || ' › ' || v_uname || '.'
                  else '. It will be routed to the right office by the Council.' end,
          true);

  return v_code;
end $$;
grant execute on function public.gc_submit_complaint(jsonb) to anon, authenticated;
