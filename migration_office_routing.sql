-- =====================================================================
-- Council of Leaders Grievance System: migration
--   OFFICE ROUTING  (Department > Unit > Concern)
--
--   • Admin-managed directory: gc_departments > gc_units > gc_concerns
--   • Students pick Department > Unit > Concern (or "I'm not sure" and search
--     every concern across all departments)
--   • Admins can re-route a submission to another office; the student is told
--     (public timeline entry here + email from the app)
--
-- RUN ORDER:  schema.sql  ->  migration_categories_validation.sql  ->  THIS FILE
-- Safe to run more than once. Re-running NEVER overwrites the directory once it
-- has content (the starter list is only inserted while the directory is empty).
-- =====================================================================

-- ---------------------------------------------------------
-- 1. Directory tables
-- ---------------------------------------------------------
create table if not exists public.gc_departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 120),
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists gc_departments_name_uq on public.gc_departments (lower(name));

create table if not exists public.gc_units (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.gc_departments(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 2 and 160),
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists gc_units_name_uq on public.gc_units (department_id, lower(name));

create table if not exists public.gc_concerns (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.gc_units(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 2 and 160),
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists gc_concerns_name_uq on public.gc_concerns (unit_id, lower(name));

-- ---------------------------------------------------------
-- 2. Complaint columns
--    ids  = live link to the directory (set null if an item is deleted)
--    text = readable copy, kept in sync when an item is renamed (section 4)
-- ---------------------------------------------------------
alter table public.gc_complaints add column if not exists department_id uuid references public.gc_departments(id) on delete set null;
alter table public.gc_complaints add column if not exists unit_id       uuid references public.gc_units(id)       on delete set null;
alter table public.gc_complaints add column if not exists concern_id    uuid references public.gc_concerns(id)    on delete set null;
alter table public.gc_complaints add column if not exists office_department text;
alter table public.gc_complaints add column if not exists office_unit       text;
alter table public.gc_complaints add column if not exists office_concern    text;
alter table public.gc_complaints add column if not exists office_unsure     boolean not null default false;  -- student chose "I'm not sure"
alter table public.gc_complaints add column if not exists feedback_type     text;                            -- feedback only: Suggestion / Compliment / ...

create index if not exists gc_complaints_unit_idx    on public.gc_complaints(unit_id);
create index if not exists gc_complaints_dept_idx    on public.gc_complaints(department_id);
create index if not exists gc_complaints_concern_idx on public.gc_complaints(concern_id);

-- New timeline entry type: 'reassignment' (visible to the student)
alter table public.gc_updates drop constraint if exists gc_updates_kind_check;
alter table public.gc_updates add  constraint gc_updates_kind_check check (kind in (
  'submitted','status_change','assignment','priority_change',
  'public_response','internal_note','follow_up','reassignment'));

create or replace function public.gc_updates_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is not null then
    new.author_name := coalesce(public.gc_staff_name(new.author_id), new.author_name);
  end if;
  new.is_public := new.kind in ('submitted','status_change','public_response','follow_up','reassignment');
  return new;
end $$;
revoke all on function public.gc_updates_before_insert() from public, anon, authenticated;

-- ---------------------------------------------------------
-- 3. Security: staff read the whole directory, only admins change it.
--    The public site reads it through gc_get_directory() (section 5).
-- ---------------------------------------------------------
alter table public.gc_departments enable row level security;
alter table public.gc_units       enable row level security;
alter table public.gc_concerns    enable row level security;

revoke all on public.gc_departments, public.gc_units, public.gc_concerns from anon;
grant select, insert, update, delete on public.gc_departments, public.gc_units, public.gc_concerns to authenticated;

do $$
declare t text;
begin
  foreach t in array array['gc_departments','gc_units','gc_concerns'] loop
    execute format('drop policy if exists %I on public.%I', t || ': staff read', t);
    execute format('drop policy if exists %I on public.%I', t || ': admin insert', t);
    execute format('drop policy if exists %I on public.%I', t || ': admin update', t);
    execute format('drop policy if exists %I on public.%I', t || ': admin delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.gc_is_staff())', t || ': staff read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.gc_is_admin())', t || ': admin insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.gc_is_admin()) with check (public.gc_is_admin())', t || ': admin update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.gc_is_admin())', t || ': admin delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------
-- 4. Renames flow through to existing submissions
--    (their text copy is updated; updated_at is NOT bumped by a rename)
-- ---------------------------------------------------------
create or replace function public.gc_complaints_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- pg_trigger_depth() > 1 means this update was caused by another trigger
  -- (a directory rename), not by a person handling the complaint.
  if pg_trigger_depth() <= 1 then
    new.updated_at := now();
  end if;

  if new.status is distinct from old.status then
    if new.status = 'resolved' then new.resolved_at := now(); end if;
    if new.status = 'closed'   then new.closed_at   := now(); end if;
    if new.status not in ('resolved','closed') then
      new.resolved_at := null;
      new.closed_at   := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.gc_complaints_before_update() from public, anon, authenticated;

create or replace function public.gc_sync_office_names()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'gc_departments' then
    update public.gc_complaints set office_department = new.name, category = new.name where department_id = new.id;
  elsif tg_table_name = 'gc_units' then
    update public.gc_complaints set office_unit = new.name where unit_id = new.id;
  else
    update public.gc_complaints set office_concern = new.name, subcategory = new.name where concern_id = new.id;
  end if;
  return null;
end $$;
revoke all on function public.gc_sync_office_names() from public, anon, authenticated;

drop trigger if exists gc_departments_sync on public.gc_departments;
create trigger gc_departments_sync after update of name on public.gc_departments
  for each row when (old.name is distinct from new.name) execute function public.gc_sync_office_names();
drop trigger if exists gc_units_sync on public.gc_units;
create trigger gc_units_sync after update of name on public.gc_units
  for each row when (old.name is distinct from new.name) execute function public.gc_sync_office_names();
drop trigger if exists gc_concerns_sync on public.gc_concerns;
create trigger gc_concerns_sync after update of name on public.gc_concerns
  for each row when (old.name is distinct from new.name) execute function public.gc_sync_office_names();

-- ---------------------------------------------------------
-- 5. Public directory (what the form shows).
--    Only ACTIVE items, and only units that still have at least one active concern.
-- ---------------------------------------------------------
create or replace function public.gc_get_directory()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(dep.obj order by dep.sort_order, dep.name), '[]'::jsonb)
  from (
    select d.sort_order, d.name,
           jsonb_build_object('id', d.id, 'name', d.name, 'units', un.units) as obj
    from public.gc_departments d
    cross join lateral (
      select coalesce(jsonb_agg(uo.obj order by uo.sort_order, uo.name), '[]'::jsonb) as units
      from (
        select u.sort_order, u.name,
               jsonb_build_object('id', u.id, 'name', u.name, 'concerns', cn.concerns) as obj
        from public.gc_units u
        cross join lateral (
          select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order, c.name), '[]'::jsonb) as concerns
          from public.gc_concerns c
          where c.unit_id = u.id and c.is_active
        ) cn
        where u.department_id = d.id and u.is_active and jsonb_array_length(cn.concerns) > 0
      ) uo
    ) un
    where d.is_active and jsonb_array_length(un.units) > 0
  ) dep
$$;
grant execute on function public.gc_get_directory() to anon, authenticated;

-- ---------------------------------------------------------
-- 6. Submit complaint: Department > Unit > Concern
--    payload: concern_id (uuid)  -> unit and department are derived from it
--             office_unsure (bool) -> student picked "I'm not sure"
--    If the student is unsure AND found no matching concern, concern_id may be empty:
--    the complaint is saved as "Not yet routed" for an admin to route.
-- ---------------------------------------------------------
create or replace function public.gc_submit_complaint(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_anon      boolean := coalesce((p->>'is_anonymous')::boolean, false);
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
    reference_no, tracking_code, is_anonymous,
    complainant_name, student_id, email, contact_no, program, year_level,
    department_id, unit_id, concern_id, office_department, office_unit, office_concern, office_unsure,
    category, subcategory, flagged_language, subject, description, incident_date, incident_location, respondent, desired_outcome
  ) values (
    public.gc_next_reference('GC'), v_code, false,
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
          || case when v_dname is not null then ' and sent to ' || v_dname || ' › ' || v_uname || '.' else '. It will be routed to the right office by the Council.' end,
          true);

  return v_code;
end $$;

-- ---------------------------------------------------------
-- 7. Submit feedback: same routing + a "type of feedback"
-- ---------------------------------------------------------
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

  v_ref := public.gc_next_reference('FB');

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

-- ---------------------------------------------------------
-- 8. Tracking page also returns the routing
-- ---------------------------------------------------------
create or replace function public.gc_track_complaint(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.gc_complaints;
begin
  select * into c from public.gc_complaints where tracking_code = upper(btrim(coalesce(p_code,''))) and type = 'complaint';
  if not found then return null; end if;

  return jsonb_build_object(
    'tracking_code', c.tracking_code,
    'category', c.category,
    'subcategory', c.subcategory,
    'department', c.office_department,
    'unit', c.office_unit,
    'concern', c.office_concern,
    'unrouted', (c.office_department is null and c.office_unsure),
    'subject', c.subject,
    'status', c.status,
    'is_anonymous', c.is_anonymous,
    'submitted_at', c.submitted_at,
    'updated_at', c.updated_at,
    'resolution_summary', case when c.status in ('resolved','closed','dismissed') then c.resolution_summary else null end,
    'satisfaction_rating', c.satisfaction_rating,
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id,
               'kind', u.kind,
               'author', case u.author_type when 'staff' then 'Council of Leaders'
                                            when 'complainant' then 'You'
                                            else 'System' end,
               'message', u.message,
               'from_status', u.from_status,
               'to_status', u.to_status,
               'created_at', u.created_at) order by u.created_at)
      from public.gc_updates u where u.complaint_id = c.id and u.is_public
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------
-- 9. ADMIN: move a submission to a different office
--    Works for wrongly-picked offices AND for "Not yet routed" ones.
--    Writes a public timeline entry so the student sees the change on the
--    tracking page (the app also emails them).
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
         category = r.dname, subcategory = r.cname
   where id = p_id;

  insert into public.gc_updates (complaint_id, author_id, author_type, author_name, kind, message)
  values (p_id, auth.uid(), 'staff', public.gc_staff_name(auth.uid()), 'reassignment',
          'Routed to ' || v_new || ' (previously: ' || v_old || ').' || coalesce(' Note: ' || v_note, ''));

  return jsonb_build_object('old_label', v_old, 'new_label', v_new, 'note', v_note);
end $$;

revoke all on function public.gc_reassign_complaint(uuid, uuid, text) from public, anon;
grant execute on function public.gc_reassign_complaint(uuid, uuid, text) to authenticated;

grant execute on function public.gc_submit_complaint(jsonb) to anon, authenticated;
grant execute on function public.gc_submit_feedback(jsonb)  to anon, authenticated;
grant execute on function public.gc_track_complaint(text)   to anon, authenticated;

-- ---------------------------------------------------------
-- 10. Starter directory (inserted ONLY while the directory is empty).
--     Every unit gets its own concerns (plus "Other concern").
--     Edit all of it later in the staff app: Offices & Concerns.
-- ---------------------------------------------------------
do $$
declare
  v_seed jsonb := '[
 {
  "n": "Administration/Executive",
  "u": [
   {
    "n": "IT Services Office",
    "c": [
     "Email / NU account concerns",
     "ID concerns",
     "Computer / laboratory concerns",
     "Wi-Fi and internet connection",
     "Online portal / learning system access",
     "Other concern"
    ]
   },
   {
    "n": "Clinic",
    "c": [
     "Medical consultation and services",
     "Medical certificate / clearance",
     "Clinic staff conduct",
     "Other concern"
    ]
   },
   {
    "n": "Physical Facilities Management Office",
    "c": [
     "Classroom / room conditions",
     "Restrooms and sanitation",
     "Air-conditioning and lighting",
     "Repairs and maintenance",
     "Other concern"
    ]
   },
   {
    "n": "Security Office",
    "c": [
     "Safety and security incident",
     "Lost and found",
     "Gate entry / ID checking",
     "Security personnel conduct",
     "Parking",
     "Other concern"
    ]
   },
   {
    "n": "Accounting",
    "c": [
     "Tuition and fees assessment",
     "Payments and receipts",
     "Refunds",
     "Other concern"
    ]
   },
   {
    "n": "Bulldog Exchange (NU Merch Store)",
    "c": [
     "Merchandise / uniform availability",
     "Pricing and payment",
     "Staff service",
     "Other concern"
    ]
   },
   {
    "n": "Asset Management Office",
    "c": [
     "Damaged or missing equipment",
     "Equipment borrowing",
     "Other concern"
    ]
   },
   {
    "n": "Registrar",
    "c": [
     "Enrollment",
     "Grades and records",
     "Document requests (TOR, certificates)",
     "Leave of absence / readmission",
     "Other concern"
    ]
   },
   {
    "n": "Admissions",
    "c": [
     "Application process",
     "Admission requirements and entrance exam",
     "Staff service",
     "Other concern"
    ]
   },
   {
    "n": "Marketing",
    "c": [
     "Announcements and social media content",
     "Events and promotions",
     "Other concern"
    ]
   },
   {
    "n": "Quality Management Office",
    "c": [
     "Service quality complaint",
     "Policy / process improvement",
     "Other concern"
    ]
   },
   {
    "n": "Human Resources Office",
    "c": [
     "Faculty / staff conduct",
     "Employment and application concerns",
     "Other concern"
    ]
   },
   {
    "n": "Alumni Affairs Office",
    "c": [
     "Alumni records and services",
     "Alumni events",
     "Other concern"
    ]
   }
  ]
 },
 {
  "n": "Academics",
  "u": [
   {
    "n": "School of Arts and Sciences",
    "c": [
     "Instructor / faculty conduct",
     "Grading and assessment",
     "Class schedule / course offering",
     "Curriculum and program",
     "Academic advising",
     "Other concern"
    ]
   },
   {
    "n": "School of Computer Studies",
    "c": [
     "Instructor / faculty conduct",
     "Grading and assessment",
     "Class schedule / course offering",
     "Curriculum and program",
     "Academic advising",
     "Other concern"
    ]
   },
   {
    "n": "School of Accountancy, Business, and Management",
    "c": [
     "Instructor / faculty conduct",
     "Grading and assessment",
     "Class schedule / course offering",
     "Curriculum and program",
     "Academic advising",
     "Other concern"
    ]
   },
   {
    "n": "School of Engineering and Architecture",
    "c": [
     "Instructor / faculty conduct",
     "Grading and assessment",
     "Class schedule / course offering",
     "Curriculum and program",
     "Academic advising",
     "Other concern"
    ]
   }
  ]
 },
 {
  "n": "Academic Services",
  "u": [
   {
    "n": "Learning Resource Center (Library)",
    "c": [
     "Books and resource availability",
     "Borrowing and fines",
     "Library facilities and noise",
     "Staff service",
     "Other concern"
    ]
   },
   {
    "n": "Research and Knowledge Management",
    "c": [
     "Research / thesis support",
     "Publication and ethics review",
     "Other concern"
    ]
   },
   {
    "n": "Guidance Service Office",
    "c": [
     "Counseling services",
     "Student welfare concern",
     "Bullying or harassment",
     "Other concern"
    ]
   },
   {
    "n": "Discipline Office",
    "c": [
     "Disciplinary case / process",
     "Uniform and dress code",
     "Reporting a rule violation",
     "Other concern"
    ]
   },
   {
    "n": "Academe-Industry Linkage and Placement Office",
    "c": [
     "Internship / OJT placement",
     "Job placement and career services",
     "Industry partnerships",
     "Other concern"
    ]
   },
   {
    "n": "Student Development and Activities Office (Student Affairs)",
    "c": [
     "Student organization concerns",
     "Event and activity permits",
     "Student council / officer conduct",
     "Other concern"
    ]
   },
   {
    "n": "Community Extension",
    "c": [
     "Outreach program participation",
     "Community service hours",
     "Other concern"
    ]
   }
  ]
 },
 {
  "n": "INSPIRE and Cafeteria",
  "u": [
   {
    "n": "INSPIRE Sports Facilities",
    "c": [
     "Facility condition",
     "Reservations and schedule",
     "Equipment",
     "Staff conduct",
     "Other concern"
    ]
   },
   {
    "n": "Food Stalls",
    "c": [
     "Food quality and safety",
     "Pricing",
     "Cleanliness",
     "Vendor conduct",
     "Other concern"
    ]
   },
   {
    "n": "Cafeteria",
    "c": [
     "Food quality and safety",
     "Pricing",
     "Cleanliness",
     "Seating and space",
     "Staff service",
     "Other concern"
    ]
   }
  ]
 }
]'::jsonb;
  d jsonb; u jsonb; c text;
  v_did uuid; v_uid uuid;
  di int := 0; ui int; ci int;
begin
  if exists (select 1 from public.gc_departments) then return; end if;

  for d in select * from jsonb_array_elements(v_seed) loop
    di := di + 1; ui := 0;
    insert into public.gc_departments (name, sort_order) values (d->>'n', di) returning id into v_did;
    for u in select * from jsonb_array_elements(d->'u') loop
      ui := ui + 1; ci := 0;
      insert into public.gc_units (department_id, name, sort_order) values (v_did, u->>'n', ui) returning id into v_uid;
      for c in select jsonb_array_elements_text(u->'c') loop
        ci := ci + 1;
        insert into public.gc_concerns (unit_id, name, sort_order) values (v_uid, c, ci);
      end loop;
    end loop;
  end loop;
end $$;
