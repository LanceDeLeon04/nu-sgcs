-- =========================================================
-- Council of Leaders — Student Grievance and Complaints System
-- SCHEMA (safe to run on the SAME Supabase project as the
-- SCS File Repository)
--
-- • Every object is prefixed `gc_` (tables, functions, triggers)
--   or lives in its own storage bucket (`gc-evidence`).
-- • It NEVER drops, alters or reads any SCS table
--   (profiles, folders, files, access_requests, ...).
-- • Idempotent: re-running it is safe and will NOT delete complaint data.
--   (Tables use "if not exists"; functions/policies are replaced.)
--
-- Run once: Supabase Dashboard > SQL Editor > paste this file > Run.
-- =========================================================


create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------

-- Council staff who may sign in and handle complaints.
-- Login accounts live in auth.users (shared with the SCS system);
-- this table decides who is allowed INTO the complaints system.
create table if not exists public.gc_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  email      text,
  position   text,
  role       text not null default 'handler' check (role in ('admin','handler')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Per-year counter for staff-facing reference numbers (GC-2026-0001).
create table if not exists public.gc_ref_counters (
  prefix   text not null default 'GC',           -- 'GC' complaints, 'FB' feedback
  year     int  not null,
  next_seq int  not null default 1,
  primary key (prefix, year)
);

create table if not exists public.gc_complaints (
  id               uuid primary key default gen_random_uuid(),
  type             text not null default 'complaint' check (type in ('feedback','complaint')),
  reference_no     text unique not null,          -- GC-2026-0001 (complaint) / FB-2026-0001 (feedback)
  tracking_code    text unique,                   -- complaints only: complainant-facing secret, e.g. GC-3F9A-B27C-91D4 (feedback has none)

  is_anonymous     boolean not null default false,
  complainant_name text,
  student_id       text,
  email            text,
  contact_no       text,
  program          text,
  year_level       text,

  category         text not null,
  subject          text not null check (char_length(subject) between 5 and 200),
  description      text not null check (char_length(description) between 10 and 5000),
  incident_date    date,
  incident_location text,
  respondent       text,                          -- person / office / org the complaint is about
  desired_outcome  text,

  status           text not null default 'received'
                     check (status in ('received','under_review','in_progress','escalated','resolved','closed','dismissed')),
  priority         text not null default 'normal'
                     check (priority in ('low','normal','high','urgent')),
  assigned_to      uuid references public.gc_staff(user_id) on delete set null,
  resolution_summary text,
  forwarded_to     text,                          -- feedback: office(s) it was forwarded to

  satisfaction_rating  int check (satisfaction_rating between 1 and 5),
  satisfaction_comment text,

  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  closed_at    timestamptz
);

create index if not exists gc_complaints_status_idx    on public.gc_complaints(status);
create index if not exists gc_complaints_submitted_idx on public.gc_complaints(submitted_at desc);
create index if not exists gc_complaints_assigned_idx  on public.gc_complaints(assigned_to);

-- Timeline / audit trail. `is_public` rows are shown to the complainant on the tracking page.
create table if not exists public.gc_updates (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.gc_complaints(id) on delete cascade,
  author_id    uuid references public.gc_staff(user_id) on delete set null,
  author_type  text not null check (author_type in ('staff','complainant','system')),
  author_name  text,
  kind         text not null check (kind in (
                 'submitted','status_change','assignment','priority_change',
                 'public_response','internal_note','follow_up')),
  message      text,
  from_status  text,
  to_status    text,
  is_public    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists gc_updates_complaint_idx on public.gc_updates(complaint_id, created_at);

create table if not exists public.gc_attachments (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.gc_complaints(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_at  timestamptz not null default now()
);

create index if not exists gc_attachments_complaint_idx on public.gc_attachments(complaint_id);


-- ---------------------------------------------------------
-- 1b. MIGRATION — upgrades an install of the earlier schema in place
--     (adds Feedback support). No-ops on a fresh install. Never deletes data.
-- ---------------------------------------------------------
alter table public.gc_complaints add column if not exists type text not null default 'complaint';
alter table public.gc_complaints add column if not exists forwarded_to text;
alter table public.gc_complaints alter column tracking_code drop not null;
alter table public.gc_ref_counters add column if not exists prefix text not null default 'GC';
create index if not exists gc_complaints_type_idx on public.gc_complaints(type);

do $$
begin
  -- counters: primary key (year) -> (prefix, year)
  if exists (select 1 from pg_constraint
             where conrelid = 'public.gc_ref_counters'::regclass and contype = 'p' and array_length(conkey,1) = 1) then
    alter table public.gc_ref_counters drop constraint gc_ref_counters_pkey;
    alter table public.gc_ref_counters add primary key (prefix, year);
  end if;
end $$;

alter table public.gc_complaints drop constraint if exists gc_complaints_type_check;
alter table public.gc_complaints add  constraint gc_complaints_type_check check (type in ('feedback','complaint'));

alter table public.gc_complaints drop constraint if exists gc_complaints_description_check;
alter table public.gc_complaints add  constraint gc_complaints_description_check check (char_length(description) between 10 and 5000);

alter table public.gc_complaints drop constraint if exists gc_complaints_status_check;
alter table public.gc_complaints add  constraint gc_complaints_status_check
  check (status in ('received','under_review','in_progress','escalated','resolved','closed','dismissed','forwarded','noted'));

-- Complaints and feedback have different life-cycles.
alter table public.gc_complaints drop constraint if exists gc_complaints_type_status_check;
alter table public.gc_complaints add  constraint gc_complaints_type_status_check check (
  (type = 'complaint' and status in ('received','under_review','in_progress','escalated','resolved','closed','dismissed'))
  or (type = 'feedback' and status in ('received','forwarded','noted')));

-- Complaints require identification. NOT VALID = enforced for new rows only,
-- so any anonymous complaints filed under the earlier version are left untouched.
alter table public.gc_complaints drop constraint if exists gc_complaints_identified_check;
alter table public.gc_complaints add  constraint gc_complaints_identified_check
  check (type <> 'complaint' or is_anonymous = false) not valid;


-- ---------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ---------------------------------------------------------

-- Used inside RLS policies. SECURITY DEFINER so the check itself isn't blocked by RLS on gc_staff.
create or replace function public.gc_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gc_staff where user_id = auth.uid() and is_active)
$$;

create or replace function public.gc_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gc_staff where user_id = auth.uid() and is_active and role = 'admin')
$$;

drop function if exists public.gc_next_reference();
create or replace function public.gc_next_reference(p_prefix text default 'GC')
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from now())::int;
  v_seq  int;
begin
  insert into public.gc_ref_counters (prefix, year, next_seq) values (p_prefix, v_year, 2)
  on conflict (prefix, year) do update set next_seq = public.gc_ref_counters.next_seq + 1
  returning next_seq - 1 into v_seq;
  return p_prefix || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end $$;

-- 48 bits of randomness (from gen_random_uuid) -> GC-XXXX-XXXX-XXXX
create or replace function public.gc_generate_tracking_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_hex  text;
  v_code text;
begin
  loop
    v_hex  := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    v_code := 'GC-' || substr(v_hex,1,4) || '-' || substr(v_hex,5,4) || '-' || substr(v_hex,9,4);
    exit when not exists (select 1 from public.gc_complaints where tracking_code = v_code);
  end loop;
  return v_code;
end $$;

create or replace function public.gc_staff_name(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select full_name from public.gc_staff where user_id = p_id
$$;


-- ---------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------

-- 3a. gc_complaints BEFORE UPDATE: timestamps
create or replace function public.gc_complaints_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();

  if new.status is distinct from old.status then
    if new.status = 'resolved' then new.resolved_at := now(); end if;
    if new.status = 'closed'   then new.closed_at   := now(); end if;
    if new.status not in ('resolved','closed') then
      new.resolved_at := null;
      new.closed_at   := null;
    end if;
  end if;

  -- Any active staff member may assign a complaint/feedback to any other active staff member
  -- (a staff member can only be assigned if they are in gc_staff; the FK enforces this).

  return new;
end $$;

drop trigger if exists gc_complaints_before_update on public.gc_complaints;
create trigger gc_complaints_before_update
  before update on public.gc_complaints
  for each row execute function public.gc_complaints_before_update();

-- 3b. gc_complaints AFTER UPDATE: write the audit trail automatically
create or replace function public.gc_complaints_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_name  text := coalesce(public.gc_staff_name(auth.uid()), 'System');
  v_type  text := case when auth.uid() is null then 'system' else 'staff' end;
begin
  if new.status is distinct from old.status then
    insert into public.gc_updates (complaint_id, author_id, author_type, author_name, kind, from_status, to_status, is_public)
    values (new.id, v_actor, v_type, v_name, 'status_change', old.status, new.status, true);
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.gc_updates (complaint_id, author_id, author_type, author_name, kind, message, is_public)
    values (new.id, v_actor, v_type, v_name, 'assignment',
            case when new.assigned_to is null then 'Unassigned'
                 else 'Assigned to ' || coalesce(public.gc_staff_name(new.assigned_to), 'staff member') end,
            false);
  end if;

  if new.forwarded_to is distinct from old.forwarded_to then
    insert into public.gc_updates (complaint_id, author_id, author_type, author_name, kind, message, is_public)
    values (new.id, v_actor, v_type, v_name, 'assignment',
            case when nullif(btrim(coalesce(new.forwarded_to,'')), '') is null then 'Forwarding cleared'
                 else 'Forwarded to: ' || new.forwarded_to end, false);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.gc_updates (complaint_id, author_id, author_type, author_name, kind, message, is_public)
    values (new.id, v_actor, v_type, v_name, 'priority_change',
            'Priority changed from ' || old.priority || ' to ' || new.priority, false);
  end if;

  return null;
end $$;

drop trigger if exists gc_complaints_after_update on public.gc_complaints;
create trigger gc_complaints_after_update
  after update on public.gc_complaints
  for each row execute function public.gc_complaints_after_update();

-- 3c. gc_updates BEFORE INSERT: stamp the real author name + visibility server-side
create or replace function public.gc_updates_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is not null then
    new.author_name := coalesce(public.gc_staff_name(new.author_id), new.author_name);
  end if;
  new.is_public := new.kind in ('submitted','status_change','public_response','follow_up');
  return new;
end $$;

drop trigger if exists gc_updates_before_insert on public.gc_updates;
create trigger gc_updates_before_insert
  before insert on public.gc_updates
  for each row execute function public.gc_updates_before_insert();


-- ---------------------------------------------------------
-- 4. ROW LEVEL SECURITY
--    Anonymous visitors get NO direct table access at all;
--    the public site talks to the database only through the
--    SECURITY DEFINER functions in section 5.
-- ---------------------------------------------------------
alter table public.gc_staff         enable row level security;
alter table public.gc_ref_counters  enable row level security;
alter table public.gc_complaints    enable row level security;
alter table public.gc_updates       enable row level security;
alter table public.gc_attachments   enable row level security;

revoke all on public.gc_staff, public.gc_ref_counters, public.gc_complaints,
              public.gc_updates, public.gc_attachments from anon;

-- gc_staff
drop policy if exists "gc staff: read"   on public.gc_staff;
drop policy if exists "gc staff: admin update" on public.gc_staff;
drop policy if exists "gc staff: admin delete" on public.gc_staff;
create policy "gc staff: read" on public.gc_staff for select to authenticated
  using (public.gc_is_staff() or user_id = auth.uid());
create policy "gc staff: admin update" on public.gc_staff for update to authenticated
  using (public.gc_is_admin()) with check (public.gc_is_admin());
create policy "gc staff: admin delete" on public.gc_staff for delete to authenticated
  using (public.gc_is_admin());
-- (inserts happen only through gc_add_staff())

-- gc_complaints: staff read/update; admins delete. Inserts only via gc_submit_complaint().
drop policy if exists "gc complaints: staff read"   on public.gc_complaints;
drop policy if exists "gc complaints: staff update" on public.gc_complaints;
drop policy if exists "gc complaints: admin delete" on public.gc_complaints;
create policy "gc complaints: staff read" on public.gc_complaints for select to authenticated
  using (public.gc_is_staff());
create policy "gc complaints: staff update" on public.gc_complaints for update to authenticated
  using (public.gc_is_staff()) with check (public.gc_is_staff());
create policy "gc complaints: admin delete" on public.gc_complaints for delete to authenticated
  using (public.gc_is_admin());

-- Staff can only change these columns (status, priority, assignment, outcome summary, feedback forwarding); identity/description/tracking fields are immutable.
revoke update on public.gc_complaints from authenticated;
grant  update (status, priority, assigned_to, resolution_summary, forwarded_to) on public.gc_complaints to authenticated;

-- gc_updates: staff read; staff may add responses/notes as themselves (everything else is written by triggers/RPCs)
drop policy if exists "gc updates: staff read"   on public.gc_updates;
drop policy if exists "gc updates: staff insert" on public.gc_updates;
create policy "gc updates: staff read" on public.gc_updates for select to authenticated
  using (public.gc_is_staff());
create policy "gc updates: staff insert" on public.gc_updates for insert to authenticated
  with check (
    public.gc_is_staff()
    and author_id = auth.uid()
    and author_type = 'staff'
    and kind in ('public_response','internal_note')
  );

-- gc_attachments: staff read only
drop policy if exists "gc attachments: staff read" on public.gc_attachments;
create policy "gc attachments: staff read" on public.gc_attachments for select to authenticated
  using (public.gc_is_staff());

grant execute on function public.gc_is_staff()  to authenticated;
grant execute on function public.gc_is_admin()  to authenticated;
grant execute on function public.gc_staff_name(uuid) to authenticated;


-- ---------------------------------------------------------
-- 5. PUBLIC RPCs (SECURITY DEFINER) — used by the anonymous site
--    Same pattern as the SCS grievance/feedback submission:
--    validate everything in SQL, never expose the tables to anon.
-- ---------------------------------------------------------

-- 5a. Submit a complaint. Returns the tracking code.
create or replace function public.gc_submit_complaint(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_anon      boolean := coalesce((p->>'is_anonymous')::boolean, false);
  v_sid       uuid    := nullif(p->>'submission_id','')::uuid;
  v_category  text    := btrim(coalesce(p->>'category',''));
  v_subject   text    := btrim(coalesce(p->>'subject',''));
  v_desc      text    := btrim(coalesce(p->>'description',''));
  v_name      text    := nullif(btrim(coalesce(p->>'complainant_name','')), '');
  v_email     text    := nullif(btrim(coalesce(p->>'email','')), '');
  v_id        uuid;
  v_code      text;
  v_att       jsonb;
  v_att_count int := 0;
  v_categories text[] := array[
    'Academic Concern','Instructor / Faculty Conduct','Student Council / Officer Conduct',
    'Student Organization Concern','Harassment or Bullying','Discrimination',
    'Facilities & Services','Fees & Financial Concern','Office / Administrative Service',
    'Safety & Security','Other'];
begin
  if not (v_category = any(v_categories)) then
    raise exception 'Please choose a valid category.';
  end if;
  if char_length(v_subject) < 5 or char_length(v_subject) > 200 then
    raise exception 'Subject must be between 5 and 200 characters.';
  end if;
  if char_length(v_desc) < 20 or char_length(v_desc) > 5000 then
    raise exception 'Description must be between 20 and 5000 characters.';
  end if;
  -- Formal complaints are trackable and may need a Teams follow-up, so identification is mandatory.
  if v_anon then
    raise exception 'Formal complaints require identification. To stay anonymous, submit Feedback instead.';
  end if;
  if v_name is null then raise exception 'Please provide your full name.'; end if;
  if nullif(btrim(coalesce(p->>'student_id','')), '') is null then raise exception 'Please provide your student ID.'; end if;
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please provide a valid email address so a representative can reach you on Microsoft Teams.';
  end if;
  if jsonb_typeof(coalesce(p->'attachments','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p->'attachments','[]'::jsonb)) > 3 then
    raise exception 'You can attach up to 3 files.';
  end if;

  v_code := public.gc_generate_tracking_code();

  insert into public.gc_complaints (
    reference_no, tracking_code, is_anonymous,
    complainant_name, student_id, email, contact_no, program, year_level,
    category, subject, description, incident_date, incident_location, respondent, desired_outcome
  ) values (
    public.gc_next_reference('GC'), v_code, false,
    left(v_name, 150),
    left(nullif(btrim(coalesce(p->>'student_id','')), ''), 50),
    left(v_email, 200),
    left(nullif(btrim(coalesce(p->>'contact_no','')), ''), 50),
    left(nullif(btrim(coalesce(p->>'program','')), ''), 150),
    left(nullif(btrim(coalesce(p->>'year_level','')), ''), 50),
    v_category, v_subject, v_desc,
    nullif(p->>'incident_date','')::date,
    left(nullif(btrim(coalesce(p->>'incident_location','')), ''), 200),
    left(nullif(btrim(coalesce(p->>'respondent','')), ''), 200),
    left(nullif(btrim(coalesce(p->>'desired_outcome','')), ''), 1000)
  ) returning id into v_id;

  -- Attachments must live under submissions/<submission_id>/ in the evidence bucket.
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
          'Complaint received' || case when v_att_count > 0 then ' with ' || v_att_count || ' attachment(s)' else '' end || '.',
          true);

  return v_code;
end $$;

-- 5a-2. Submit FEEDBACK (anonymous allowed). Filing/reporting only: no tracking code,
--       no resolution workflow; staff forward it to the concerned office(s).
--       Returns a reference number for the sender's own records.
create or replace function public.gc_submit_feedback(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_anon     boolean := coalesce((p->>'is_anonymous')::boolean, false);
  v_category text    := btrim(coalesce(p->>'category',''));
  v_subject  text    := btrim(coalesce(p->>'subject',''));
  v_msg      text    := btrim(coalesce(p->>'description',''));
  v_name     text    := nullif(btrim(coalesce(p->>'complainant_name','')), '');
  v_email    text    := nullif(btrim(coalesce(p->>'email','')), '');
  v_ref      text;
  v_id       uuid;
  v_categories text[] := array[
    'Suggestion','Compliment / Commendation','Concern / Observation','Academic',
    'Student Council / Organization','Facilities & Services','Office / Administrative Service',
    'Events & Activities','Other'];
begin
  if not (v_category = any(v_categories)) then raise exception 'Please choose a valid category.'; end if;
  if char_length(v_subject) < 5 or char_length(v_subject) > 200 then
    raise exception 'Subject must be between 5 and 200 characters.';
  end if;
  if char_length(v_msg) < 10 or char_length(v_msg) > 5000 then
    raise exception 'Feedback must be between 10 and 5000 characters.';
  end if;
  if not v_anon then
    if v_name is null then raise exception 'Please provide your name, or choose to send feedback anonymously.'; end if;
    if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'That email address does not look valid.';
    end if;
  end if;

  v_ref := public.gc_next_reference('FB');

  insert into public.gc_complaints (
    type, reference_no, tracking_code, is_anonymous,
    complainant_name, student_id, email, program, year_level,
    category, subject, description, respondent
  ) values (
    'feedback', v_ref, null, v_anon,
    case when v_anon then null else left(v_name, 150) end,
    case when v_anon then null else left(nullif(btrim(coalesce(p->>'student_id','')), ''), 50) end,
    case when v_anon then null else left(v_email, 200) end,
    case when v_anon then null else left(nullif(btrim(coalesce(p->>'program','')), ''), 150) end,
    case when v_anon then null else left(nullif(btrim(coalesce(p->>'year_level','')), ''), 50) end,
    v_category, v_subject, v_msg,
    left(nullif(btrim(coalesce(p->>'respondent','')), ''), 200)   -- office / person the feedback is about
  ) returning id into v_id;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (v_id, 'system', 'System', 'submitted', 'Feedback received.', false);

  return v_ref;
end $$;

-- 5b. Track a complaint by its secret code. Returns null if not found.
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
               -- never expose which staff member wrote something
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

-- 5c. Complainant adds a follow-up message (reopens a resolved complaint).
create or replace function public.gc_add_followup(p_code text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
  v_msg text := btrim(coalesce(p_message,''));
begin
  if char_length(v_msg) < 3 or char_length(v_msg) > 2000 then
    raise exception 'Your message must be between 3 and 2000 characters.';
  end if;

  select * into c from public.gc_complaints where tracking_code = upper(btrim(coalesce(p_code,'')));
  if not found then raise exception 'Complaint not found.'; end if;
  if c.status in ('closed','dismissed') then
    raise exception 'This complaint is closed. Please file a new complaint and reference %.', c.reference_no;
  end if;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (c.id, 'complainant', case when c.is_anonymous then 'Anonymous' else coalesce(c.complainant_name,'Complainant') end,
          'follow_up', v_msg, true);

  if c.status = 'resolved' then
    update public.gc_complaints set status = 'under_review' where id = c.id;
  end if;
end $$;

-- 5d. Complainant rates the outcome once resolved/closed.
create or replace function public.gc_rate_resolution(p_code text, p_rating int, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;
  select * into c from public.gc_complaints where tracking_code = upper(btrim(coalesce(p_code,'')));
  if not found then raise exception 'Complaint not found.'; end if;
  if c.status not in ('resolved','closed') then
    raise exception 'You can rate the outcome once the complaint is resolved.';
  end if;
  if c.satisfaction_rating is not null then
    raise exception 'You have already submitted feedback for this complaint.';
  end if;
  update public.gc_complaints
     set satisfaction_rating = p_rating,
         satisfaction_comment = left(nullif(btrim(coalesce(p_comment,'')), ''), 1000)
   where id = c.id;
end $$;

-- 5e. Admin-only: give an existing login account access to the complaints system.
create or replace function public.gc_add_staff(p_email text, p_full_name text, p_position text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
begin
  if not public.gc_is_admin() then raise exception 'Only admins can manage staff.'; end if;
  if p_role not in ('admin','handler') then raise exception 'Invalid role.'; end if;

  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'No login account exists for that email. Use Manage Staff > Create account to make the login (or npm run create-staff).';
  end if;

  insert into public.gc_staff (user_id, full_name, email, position, role, is_active)
  values (v_uid, btrim(p_full_name), lower(btrim(p_email)), nullif(btrim(coalesce(p_position,'')), ''), p_role, true)
  on conflict (user_id) do update
    set full_name = excluded.full_name, email = excluded.email, position = excluded.position,
        role = excluded.role, is_active = true;
end $$;

-- 5f. Admin-only: CREATE a staff login (username or email + password) and give it access in one step.
--     A username without "@" is stored as <username>@col.local, matching the staff login form.
--     If a login with that email already exists (e.g. an SCS account) it is linked and its password
--     is left untouched. Inserts into auth.users directly (same technique as the built-in admin seed).
create or replace function public.gc_create_staff_account(
  p_login text, p_password text, p_full_name text, p_position text, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_login   text := lower(btrim(coalesce(p_login, '')));
  v_email   text;
  v_uid     uuid;
  v_created boolean := false;
begin
  if not public.gc_is_admin() then raise exception 'Only admins can create staff accounts.'; end if;
  if p_role not in ('admin','handler') then raise exception 'Invalid role.'; end if;
  if btrim(coalesce(p_full_name, '')) = '' then raise exception 'Full name is required.'; end if;
  if v_login = '' then raise exception 'Enter a username or an email address.'; end if;

  if position('@' in v_login) > 0 then
    v_email := v_login;
    if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address does not look valid.'; end if;
  else
    if v_login !~ '^[a-z0-9._-]{3,40}$' then
      raise exception 'Usernames need 3-40 characters: letters, numbers, dot, dash or underscore.';
    end if;
    v_email := v_login || '@col.local';
  end if;

  select id into v_uid from auth.users where lower(email) = v_email limit 1;

  if v_uid is null then
    if char_length(coalesce(p_password, '')) < 8 then
      raise exception 'Set a password of at least 8 characters for the new account.';
    end if;
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', btrim(p_full_name)),
      false, now(), now()
    );

    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid::text, v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());

    v_created := true;
  end if;

  insert into public.gc_staff (user_id, full_name, email, position, role, is_active)
  values (v_uid, btrim(p_full_name), v_email, nullif(btrim(coalesce(p_position, '')), ''), p_role, true)
  on conflict (user_id) do update
    set full_name = excluded.full_name, email = excluded.email, position = excluded.position,
        role = excluded.role, is_active = true;

  return jsonb_build_object('created', v_created, 'login', v_email);
end $$;

-- 5g. Admin-only: set a new password for a staff member.
create or replace function public.gc_set_staff_password(p_user_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.gc_is_admin() then raise exception 'Only admins can reset passwords.'; end if;
  if char_length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters.'; end if;
  if not exists (select 1 from public.gc_staff where user_id = p_user_id) then
    raise exception 'That person is not on the complaints staff list.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user_id;
end $$;

-- Lock down who can call what
revoke all on function public.gc_next_reference(text)         from public, anon, authenticated;
revoke all on function public.gc_generate_tracking_code()    from public, anon, authenticated;
revoke all on function public.gc_complaints_before_update()  from public, anon, authenticated;
revoke all on function public.gc_complaints_after_update()   from public, anon, authenticated;
revoke all on function public.gc_updates_before_insert()     from public, anon, authenticated;
revoke all on function public.gc_add_staff(text,text,text,text) from public, anon;
revoke all on function public.gc_create_staff_account(text,text,text,text,text) from public, anon;
revoke all on function public.gc_set_staff_password(uuid,text) from public, anon;

grant execute on function public.gc_submit_complaint(jsonb)           to anon, authenticated;
grant execute on function public.gc_submit_feedback(jsonb)            to anon, authenticated;
grant execute on function public.gc_track_complaint(text)             to anon, authenticated;
grant execute on function public.gc_add_followup(text,text)           to anon, authenticated;
grant execute on function public.gc_rate_resolution(text,int,text)    to anon, authenticated;
grant execute on function public.gc_add_staff(text,text,text,text)    to authenticated;
grant execute on function public.gc_create_staff_account(text,text,text,text,text) to authenticated;
grant execute on function public.gc_set_staff_password(uuid,text)     to authenticated;


-- ---------------------------------------------------------
-- 6. STORAGE — private evidence bucket
--    Anyone may UPLOAD (into submissions/<id>/…) so anonymous
--    complainants can attach evidence; only active staff can READ.
--    Size/type limits are enforced by the bucket itself.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gc-evidence', 'gc-evidence', false, 5242880,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

drop policy if exists "gc evidence: public upload" on storage.objects;
drop policy if exists "gc evidence: staff read"    on storage.objects;
drop policy if exists "gc evidence: admin delete"  on storage.objects;

create policy "gc evidence: public upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'gc-evidence' and (storage.foldername(name))[1] = 'submissions');

create policy "gc evidence: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'gc-evidence' and public.gc_is_staff());

create policy "gc evidence: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'gc-evidence' and public.gc_is_admin());


-- ---------------------------------------------------------
-- 7. BUILT-IN ADMIN ACCOUNT
--    Username: ADMIN_COL      Password: COL2026-2027
--
--    This is a REAL account created in Supabase Auth (password stored
--    hashed, never in the frontend code), plus an admin row in gc_staff.
--    The login form maps the username to the email admin_col@col.local.
--    Inserted directly into auth.users, like the SCS system's seed does
--    (the SQL Editor runs as postgres, so it can write to the auth schema).
--
--    Safe to re-run: if the account exists it is kept (password untouched)
--    and only its admin access in gc_staff is re-asserted.
--    ⚠️ Change the password after first sign-in (Settings page).
-- ---------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_email    text := 'admin_col@col.local';
  v_password text := 'COL2026-2027';
  v_uid      uuid;
begin
  select id into v_uid from auth.users where email = v_email limit 1;

  if v_uid is null then
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', 'Council Admin'),
      false, now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email),
      'email', now(), now(), now()
    );
  end if;

  insert into public.gc_staff (user_id, full_name, email, position, role, is_active)
  values (v_uid, 'Council Admin', v_email, 'System Administrator', 'admin', true)
  on conflict (user_id) do update set role = 'admin', is_active = true;
end $$;


-- =========================================================
-- Done. You can already sign in at /staff/login with
--   username ADMIN_COL  /  password COL2026-2027   (section 7 above).
-- To add more people:
--   • run seed_staff_from_scs.sql (copies the SCS admins
--     into gc_staff as complaint-system admins), OR
--   • npm run create-staff  (creates a login + gc_staff row), OR
--   • Manually, for an existing login:
--       insert into public.gc_staff (user_id, full_name, email, position, role)
--       select id, 'Your Name', email, 'Council President', 'admin'
--       from auth.users where email = 'you@example.com';
-- =========================================================
