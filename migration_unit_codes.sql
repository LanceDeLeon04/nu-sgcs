-- =====================================================================
-- Council of Leaders Grievance System: migration
--   UNIT CODES + CASE NUMBERS
--
--   • Every unit gets an EDITABLE short code (e.g. Accounting -> ACCT).
--     Admins edit it in Offices & Concerns. Codes are unique, 2-8 letters/digits.
--   • Every case gets a case number built from its unit's code:
--         Complaint:  GC-<UNIT>-0001     e.g. GC-ACCT-0001
--         Feedback:   FB-<UNIT>-0001     e.g. FB-ACCT-0001
--     The sequence runs per prefix + code and never repeats, even if a code
--     is later edited (old cases keep the number they were issued).
--   • Cases not yet routed to a unit use the code UNR (GC-UNR-0001).
--   • The case number is stored in gc_complaints.reference_no. The private
--     complainant tracking_code (GC-XXXX-XXXX-XXXX) is unchanged: it stays the
--     secret used on the public /track page, because case numbers are
--     sequential and therefore guessable.
--   • Existing cases keep their old numbers (GC-2026-0001 etc.).
--
-- RUN ORDER: after migration_evidence_required.sql (and the other migrations).
-- Safe to run more than once.
-- =====================================================================

-- 1. Unit code column ------------------------------------------------
alter table public.gc_units add column if not exists code text;

-- Suggest a code from a unit name: initials of significant words; if that is
-- too short, the first letters of the name. Result is 2-8 chars A-Z0-9.
create or replace function public.gc_suggest_unit_code(p_name text)
returns text language plpgsql immutable as $$
declare
  v_words text[];
  v_w text;
  v_code text := '';
  v_clean text := regexp_replace(upper(coalesce(p_name,'')), '[^A-Z0-9 ]', ' ', 'g');
begin
  v_words := regexp_split_to_array(btrim(v_clean), '\s+');
  foreach v_w in array v_words loop
    if v_w in ('OF','THE','AND','FOR','OFFICE','UNIT','SECTION','DEPARTMENT','SERVICES','SERVICE','&','') then continue; end if;
    v_code := v_code || left(v_w, 1);
  end loop;
  if char_length(v_code) < 2 then
    v_code := left(regexp_replace(v_clean, '\s', '', 'g'), 4);
  end if;
  if char_length(v_code) < 2 then v_code := 'UNIT'; end if;
  return left(v_code, 8);
end $$;

-- Give every existing unit a unique code (only where it has none).
do $$
declare
  r record; v_base text; v_try text; n int;
begin
  for r in select id, name from public.gc_units where code is null order by created_at, id loop
    v_base := public.gc_suggest_unit_code(r.name);
    v_try := v_base; n := 1;
    while exists (select 1 from public.gc_units where upper(code) = v_try) or v_try = 'UNR' loop
      n := n + 1;
      v_try := left(v_base, 8 - char_length(n::text)) || n::text;
    end loop;
    update public.gc_units set code = v_try where id = r.id;
  end loop;
end $$;

alter table public.gc_units alter column code set not null;

-- Normalise (upper-case, trimmed) and validate on every insert/update.
create or replace function public.gc_units_code_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_base text; v_try text; n int := 1;
begin
  if new.code is null or btrim(new.code) = '' then
    -- no code supplied on insert: auto-generate a unique one
    v_base := public.gc_suggest_unit_code(new.name);
    v_try := v_base;
    while exists (select 1 from public.gc_units where upper(code) = v_try and id <> new.id) or v_try = 'UNR' loop
      n := n + 1;
      v_try := left(v_base, 8 - char_length(n::text)) || n::text;
    end loop;
    new.code := v_try;
  else
    new.code := upper(btrim(new.code));
  end if;
  if new.code !~ '^[A-Z0-9]{2,8}$' then
    raise exception 'Unit code must be 2 to 8 letters or digits (no spaces or symbols), e.g. ACCT.';
  end if;
  if new.code = 'UNR' then
    raise exception 'UNR is reserved for cases that have not been routed to a unit yet.';
  end if;
  return new;
end $$;
revoke all on function public.gc_units_code_before_write() from public, anon, authenticated;

drop trigger if exists gc_units_code_bw on public.gc_units;
create trigger gc_units_code_bw before insert or update of code, name on public.gc_units
  for each row execute function public.gc_units_code_before_write();

create unique index if not exists gc_units_code_uq on public.gc_units (upper(code));

-- 2. Counters per prefix + code ---------------------------------------
create table if not exists public.gc_case_counters (
  prefix   text not null check (prefix in ('GC','FB')),
  code     text not null,
  next_seq int  not null default 1,
  primary key (prefix, code)
);
alter table public.gc_case_counters enable row level security;
revoke all on public.gc_case_counters from public, anon, authenticated;

-- 3. Case number generator --------------------------------------------
create or replace function public.gc_next_case_no(p_prefix text, p_unit_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text := 'UNR';
  v_seq  int;
  v_no   text;
begin
  if p_prefix not in ('GC','FB') then raise exception 'Invalid case prefix.'; end if;
  if p_unit_id is not null then
    select upper(code) into v_code from public.gc_units where id = p_unit_id;
    v_code := coalesce(v_code, 'UNR');
  end if;
  loop
    insert into public.gc_case_counters (prefix, code, next_seq) values (p_prefix, v_code, 2)
    on conflict (prefix, code) do update set next_seq = public.gc_case_counters.next_seq + 1
    returning next_seq - 1 into v_seq;
    v_no := p_prefix || '-' || v_code || '-' || lpad(v_seq::text, 4, '0');
    exit when not exists (select 1 from public.gc_complaints where reference_no = v_no);
  end loop;
  return v_no;
end $$;
revoke all on function public.gc_next_case_no(text, uuid) from public, anon, authenticated;

-- Case numbers are looked up in upper case (office page, forwarding, etc.)

-- 4. Submit functions now issue unit-based numbers ---------------------

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
    public.gc_next_case_no('GC', v_uid), v_code, false, v_confidential,
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

create or replace function public.gc_submit_feedback(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_anon     boolean := coalesce((p->>'is_anonymous')::boolean, false);
  v_concern  uuid    := nullif(btrim(coalesce(p->>'concern_id','')),'')::uuid;
  v_unsure   boolean := coalesce((p->>'office_unsure')::boolean, false);
  v_type     text    := btrim(coalesce(p->>'feedback_type',''));
  v_subject  text    := btrim(coalesce(p->>'subject',''));
  v_msg      text    := btrim(coalesce(p->>'description',''));
  v_name     text    := nullif(btrim(coalesce(p->>'complainant_name','')), '');
  v_email    text    := nullif(btrim(coalesce(p->>'email','')), '');
  v_student  text    := nullif(btrim(coalesce(p->>'student_id','')), '');
  v_ref      text;
  v_id       uuid;
  v_did uuid; v_dname text; v_uid uuid; v_uname text; v_cid uuid; v_cname text;
  v_types    text[] := array['Suggestion','Compliment / Commendation','Concern / Observation','Other'];
begin
  if not (v_type = any(v_types)) then raise exception 'Please choose the type of feedback.'; end if;

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
  if char_length(v_msg) < 10 or char_length(v_msg) > 5000 then
    raise exception 'Feedback must be between 10 and 5000 characters.';
  end if;
  if not v_anon then
    if v_name is null then raise exception 'Please provide your name, or choose to send feedback anonymously.'; end if;
    if v_student is not null and v_student !~ '^20[0-9]{2}-[0-9]{6,7}$' then
      raise exception 'Student ID must follow this format: 20XX-XXXXXX or 20XX-XXXXXXX (e.g. 2024-123456).';
    end if;
    if v_email is not null and v_email !~* '^[^@[:space:]]+@(students\.)?nu-laguna\.edu\.ph$' then
      raise exception 'Please use your NU email (@students.nu-laguna.edu.ph or @nu-laguna.edu.ph), or leave it blank.';
    end if;
  end if;
  if public.gc_has_profanity(concat_ws(' ', v_subject, v_msg, p->>'respondent')) then
    raise exception 'Your message contains language that is not allowed. Please rephrase it respectfully and try again.';
  end if;

  v_ref := public.gc_next_case_no('FB', v_uid);

  insert into public.gc_complaints (
    type, reference_no, tracking_code, is_anonymous,
    complainant_name, student_id, email, program, year_level,
    department_id, unit_id, concern_id, office_department, office_unit, office_concern, office_unsure, feedback_type,
    category, subcategory, subject, description, respondent
  ) values (
    'feedback', v_ref, null, v_anon,
    case when v_anon then null else left(v_name, 150) end,
    case when v_anon then null else v_student end,
    case when v_anon then null else left(lower(v_email), 200) end,
    case when v_anon then null else left(nullif(btrim(coalesce(p->>'program','')), ''), 150) end,
    case when v_anon then null else left(nullif(btrim(coalesce(p->>'year_level','')), ''), 50) end,
    v_did, v_uid, v_cid, v_dname, v_uname, v_cname, v_unsure, v_type,
    coalesce(v_dname, 'Unrouted'), v_cname, v_subject, v_msg,
    left(nullif(btrim(coalesce(p->>'respondent','')), ''), 200)
  ) returning id into v_id;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (v_id, 'system', 'System', 'submitted', 'Feedback received.', false);

  return v_ref;
end $$;

grant execute on function public.gc_submit_complaint(jsonb) to anon, authenticated;
grant execute on function public.gc_submit_feedback(jsonb)  to anon, authenticated;

-- 5. Case number for a just-filed complaint ---------------------------
-- The submit RPC returns the private tracking code; this returns the matching
-- public case number so the success screen can show both. The tracking code
-- is a secret only the submitter holds, so this leaks nothing.
create or replace function public.gc_case_no_for_code(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select reference_no from public.gc_complaints
   where tracking_code = upper(btrim(coalesce(p_code,''))) and type = 'complaint'
$$;
revoke all on function public.gc_case_no_for_code(text) from public, anon, authenticated;
grant execute on function public.gc_case_no_for_code(text) to anon, authenticated;

-- 6. When a unit's code is edited, nothing on existing cases changes:
--    each case keeps the number it was issued. Only NEW cases use the new code.
