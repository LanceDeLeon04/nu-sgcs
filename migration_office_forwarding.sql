-- =====================================================================
-- Council of Leaders Grievance System: migration
--   OFFICE AUTO-FORWARDING + secure office update link
--
--   • If the routed unit has an email on file, the concern is forwarded
--     to it automatically (no manual sending needed).
--   • If the unit has no email on file, a handler/admin can type an
--     email address in the ticket and forward it manually.
--   • The forwarded email contains: a Notice, a Summary, an "Update"
--     link so the office can post updates, and a unique 4-digit code.
--   • The secure link asks for the 4-digit code before showing anything
--     about the case.
--
-- RUN ORDER:  schema.sql  ->  migration_categories_validation.sql  ->
--             migration_office_routing.sql  ->  migration_unit_emails.sql
--             ->  THIS FILE
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------
-- 1. Columns on gc_complaints
-- ---------------------------------------------------------
alter table public.gc_complaints add column if not exists office_forward_email text;
alter table public.gc_complaints add column if not exists office_forwarded_at  timestamptz;
alter table public.gc_complaints add column if not exists office_access_code  text; -- 4 digits, e.g. '4821'

alter table public.gc_complaints drop constraint if exists gc_complaints_office_forward_email_check;
alter table public.gc_complaints add  constraint gc_complaints_office_forward_email_check
  check (office_forward_email is null or office_forward_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

alter table public.gc_complaints drop constraint if exists gc_complaints_office_access_code_check;
alter table public.gc_complaints add  constraint gc_complaints_office_access_code_check
  check (office_access_code is null or office_access_code ~ '^[0-9]{4}$');

create index if not exists gc_complaints_ref_idx on public.gc_complaints(reference_no);

-- ---------------------------------------------------------
-- 2. Timeline: allow the office itself to post an update
-- ---------------------------------------------------------
alter table public.gc_updates drop constraint if exists gc_updates_author_type_check;
alter table public.gc_updates add  constraint gc_updates_author_type_check
  check (author_type in ('staff','complainant','system','office'));

alter table public.gc_updates drop constraint if exists gc_updates_kind_check;
alter table public.gc_updates add  constraint gc_updates_kind_check check (kind in (
  'submitted','status_change','assignment','priority_change',
  'public_response','internal_note','follow_up','reassignment',
  'office_forward','office_update'));

-- office_update / office_forward are internal (staff-only) by default —
-- staff decide whether/what to relay to the complainant.
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

-- gc_updates: allow inserts written by the SECURITY DEFINER office RPCs below
-- (those RPCs run as the function owner, so they bypass RLS already; no
-- policy change needed for them). Nothing else changes here.

-- ---------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------
create or replace function public.gc_generate_office_code()
returns text language sql volatile as $$
  select lpad((floor(random() * 10000))::int::text, 4, '0')
$$;

-- Looks a case up by tracking_code (complaints) OR reference_no (complaints & feedback).
create or replace function public.gc_find_complaint_by_ref(p_ref text)
returns public.gc_complaints language sql stable security definer set search_path = public as $$
  select * from public.gc_complaints
   where tracking_code = upper(btrim(coalesce(p_ref,'')))
      or reference_no  = upper(btrim(coalesce(p_ref,'')))
   limit 1
$$;
revoke all on function public.gc_find_complaint_by_ref(text) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 4. Auto-forward: called right after a complaint/feedback is submitted,
--    and again after it is reassigned to a different office.
--    If the routed unit already has an email on file, this sends it
--    automatically — the caller just needs to email the result if
--    `to_email` comes back non-null. If not, `needs_manual` is true and
--    no email is sent until a handler supplies one (section 5).
--    Idempotent per case: once forwarded to a given address it won't
--    silently re-forward to a different one — reassignment always
--    generates a fresh code and target for the NEW office.
-- ---------------------------------------------------------
create or replace function public.gc_get_office_forward(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
  u record;
  v_email text;
  v_code  text;
begin
  c := public.gc_find_complaint_by_ref(p_ref);
  if c.id is null then raise exception 'Case not found.'; end if;

  if c.unit_id is null then
    return jsonb_build_object('needs_manual', true, 'reason', 'unrouted');
  end if;

  select id, name, email, head_email into u from public.gc_units where id = c.unit_id;
  v_email := coalesce(u.email, u.head_email);

  if v_email is null then
    return jsonb_build_object('needs_manual', true, 'reason', 'no_email', 'unit_name', u.name);
  end if;

  -- Already forwarded to this exact address: don't re-send, just return the
  -- existing code so the caller can no-op.
  if c.office_forward_email is not distinct from v_email and c.office_access_code is not null then
    return jsonb_build_object(
      'already_sent', true, 'to_email', v_email, 'code', c.office_access_code,
      'reference_no', c.reference_no, 'unit_name', u.name);
  end if;

  v_code := public.gc_generate_office_code();
  update public.gc_complaints
     set office_forward_email = v_email, office_access_code = v_code, office_forwarded_at = now()
   where id = c.id;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (c.id, 'system', 'System', 'office_forward', 'Automatically forwarded to ' || u.name || ' (' || v_email || ').', false);

  return jsonb_build_object(
    'to_email', v_email, 'code', v_code, 'reference_no', c.reference_no,
    'unit_name', u.name, 'needs_manual', false);
end $$;
revoke all on function public.gc_get_office_forward(text) from public, anon, authenticated;
grant execute on function public.gc_get_office_forward(text) to anon, authenticated;

-- ---------------------------------------------------------
-- 5. Manual forward — used only when no office email is on file.
--    Staff/handlers type an address in the ticket; this stores it,
--    (re)generates the 4-digit code, and returns what the client
--    needs to actually send the email via /api/send-email.
-- ---------------------------------------------------------
create or replace function public.gc_set_office_forward(p_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_code  text;
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

  return jsonb_build_object('to_email', v_email, 'code', v_code, 'reference_no', c.reference_no);
end $$;
revoke all on function public.gc_set_office_forward(uuid, text) from public, anon;
grant execute on function public.gc_set_office_forward(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- 6. Secure office link: /office/:ref — code required before ANYTHING
--    about the case is shown.
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

-- Office posts an update on the case (visible to Council staff in the timeline).
create or replace function public.gc_office_submit_update(p_ref text, p_code text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
  v_msg text := btrim(coalesce(p_message,''));
begin
  if char_length(v_msg) < 2 or char_length(v_msg) > 3000 then
    raise exception 'Please write an update between 2 and 3000 characters.';
  end if;

  c := public.gc_find_complaint_by_ref(p_ref);
  if c.id is null or c.office_access_code is null
     or c.office_access_code <> btrim(coalesce(p_code,'')) then
    raise exception 'Invalid case or code.';
  end if;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (c.id, 'office', coalesce(c.office_unit, 'Office'), 'office_update', v_msg, false);
end $$;
revoke all on function public.gc_office_submit_update(text, text, text) from public, anon, authenticated;
grant execute on function public.gc_office_submit_update(text, text, text) to anon, authenticated;
