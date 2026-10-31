-- =====================================================================
-- NUplift: Campus Feedback and Action Portal: migration
--   DIRECTOR ESCALATION + BUSINESS-DAY REMINDERS
--
--   1. New concerns in every School unit: "Dean concern" and
--      "Schedule conflict or change".
--   2. A concern can be flagged "Auto-escalate to director"
--      (gc_concerns.escalate_to_director, editable in Offices & Concerns).
--      "Dean concern" is flagged by default. A case filed under a flagged concern
--      goes to the DEPARTMENT DIRECTOR instead of the unit's own office (so the
--      person being complained about is not the one who receives it), its status
--      becomes Escalated, and the director gets the secure update link + code.
--   3. Reminders to offices now count BUSINESS days (Mon-Fri, minus holidays).
--      Holidays live in gc_holidays and are editable by admins
--      (Offices & Concerns > Holidays). Philippine national holidays for 2026 and
--      2027 are pre-loaded.
--   4. After 2 consecutive reminders with no office action, the case is escalated
--      to the director ("no action from the office for 1 week"). The scheduled
--      job (api/cron-followups.js) does the counting and sending.
--
-- RUN ORDER: after migration_concern_priority.sql (and the migrations before it).
-- Safe to run more than once; it never overwrites edits an admin made.
-- =====================================================================

-- ---------------------------------------------------------
-- 1. Holidays (skipped by the reminder counter)
-- ---------------------------------------------------------
create table if not exists public.gc_holidays (
  holiday_date date primary key,
  name         text not null check (char_length(btrim(name)) between 2 and 120),
  created_at   timestamptz not null default now()
);

alter table public.gc_holidays enable row level security;
revoke all on public.gc_holidays from anon;
grant select, insert, update, delete on public.gc_holidays to authenticated;

drop policy if exists "gc holidays: staff read"   on public.gc_holidays;
drop policy if exists "gc holidays: admin insert" on public.gc_holidays;
drop policy if exists "gc holidays: admin update" on public.gc_holidays;
drop policy if exists "gc holidays: admin delete" on public.gc_holidays;
create policy "gc holidays: staff read"   on public.gc_holidays for select to authenticated using (public.gc_is_staff());
create policy "gc holidays: admin insert" on public.gc_holidays for insert to authenticated with check (public.gc_is_admin());
create policy "gc holidays: admin update" on public.gc_holidays for update to authenticated using (public.gc_is_admin()) with check (public.gc_is_admin());
create policy "gc holidays: admin delete" on public.gc_holidays for delete to authenticated using (public.gc_is_admin());

-- Starter list (only while the table is empty, so deleting one later sticks).
-- Source: Proclamation 1006 s.2025 (+1189, 1264 for the Eids) and Proclamation 1427 s.2026.
-- Special WORKING days (e.g. Feb 25) are intentionally not listed. Eid'l Fitr / Eid'l Adha 2027
-- are not proclaimed yet: add them here when they are.
do $$
begin
  if exists (select 1 from public.gc_holidays) then return; end if;
  insert into public.gc_holidays (holiday_date, name) values
    ('2026-01-01','New Year''s Day'),
    ('2026-02-17','Chinese New Year'),
    ('2026-03-20','Eid''l Fitr'),
    ('2026-04-02','Maundy Thursday'),
    ('2026-04-03','Good Friday'),
    ('2026-04-04','Black Saturday'),
    ('2026-04-09','Araw ng Kagitingan'),
    ('2026-05-01','Labor Day'),
    ('2026-05-27','Eid''l Adha'),
    ('2026-06-12','Independence Day'),
    ('2026-08-21','Ninoy Aquino Day'),
    ('2026-08-31','National Heroes Day'),
    ('2026-11-01','All Saints'' Day'),
    ('2026-11-02','All Souls'' Day'),
    ('2026-11-30','Bonifacio Day'),
    ('2026-12-08','Feast of the Immaculate Conception of Mary'),
    ('2026-12-24','Christmas Eve'),
    ('2026-12-25','Christmas Day'),
    ('2026-12-30','Rizal Day'),
    ('2026-12-31','Last Day of the Year'),
    ('2027-01-01','New Year''s Day'),
    ('2027-02-06','Chinese New Year'),
    ('2027-03-25','Maundy Thursday'),
    ('2027-03-26','Good Friday'),
    ('2027-03-27','Black Saturday'),
    ('2027-04-09','Araw ng Kagitingan'),
    ('2027-05-01','Labor Day'),
    ('2027-06-12','Independence Day'),
    ('2027-08-21','Ninoy Aquino Day'),
    ('2027-08-30','National Heroes Day'),
    ('2027-11-01','All Saints'' Day'),
    ('2027-11-02','All Souls'' Day'),
    ('2027-11-30','Bonifacio Day'),
    ('2027-12-08','Feast of the Immaculate Conception of Mary'),
    ('2027-12-24','Christmas Eve'),
    ('2027-12-25','Christmas Day'),
    ('2027-12-30','Rizal Day'),
    ('2027-12-31','Last Day of the Year');
end $$;

-- ---------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------
alter table public.gc_concerns add column if not exists escalate_to_director boolean not null default false;

alter table public.gc_complaints add column if not exists director_escalated_at     timestamptz;
alter table public.gc_complaints add column if not exists director_escalation_reason text;
alter table public.gc_complaints add column if not exists no_action_escalated_at     timestamptz;

alter table public.gc_complaints drop constraint if exists gc_complaints_director_reason_check;
alter table public.gc_complaints add  constraint gc_complaints_director_reason_check
  check (director_escalation_reason is null or director_escalation_reason in ('concern','no_action'));

-- New timeline entry kind (staff-only; gc_updates_before_insert makes unknown kinds non-public)
alter table public.gc_updates drop constraint if exists gc_updates_kind_check;
alter table public.gc_updates add  constraint gc_updates_kind_check check (kind in (
  'submitted','status_change','assignment','priority_change',
  'public_response','internal_note','follow_up','reassignment',
  'office_forward','office_update','office_redirect_request','office_reminder',
  'director_escalation'));

-- "Consecutive" reminders: when the office acts (update or status change), the reminder count starts over.
create or replace function public.gc_complaints_office_activity_bu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.office_last_activity_at is not null
     and new.office_last_activity_at is distinct from old.office_last_activity_at then
    new.office_reminder_count := 0;
  end if;
  return new;
end $$;
revoke all on function public.gc_complaints_office_activity_bu() from public, anon, authenticated;

drop trigger if exists gc_complaints_office_activity_bu on public.gc_complaints;
create trigger gc_complaints_office_activity_bu
  before update on public.gc_complaints
  for each row execute function public.gc_complaints_office_activity_bu();

-- ---------------------------------------------------------
-- 3. Public directory also tells the form which concerns escalate
--    (so the form never forwards those to the unit's own office).
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
          select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'escalate', c.escalate_to_director)
                                    order by c.sort_order, c.name), '[]'::jsonb) as concerns
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
-- 4. New concerns in every School unit (added once per unit, never duplicated)
--      Dean concern                 -> High, auto-escalates to the director
--      Schedule conflict or change  -> Medium
--    Add the same to other units, or flag any other concern, in Offices & Concerns.
-- ---------------------------------------------------------
insert into public.gc_concerns (unit_id, name, sort_order, default_priority, escalate_to_director)
select u.id, 'Dean concern',
       coalesce((select max(sort_order) from public.gc_concerns c where c.unit_id = u.id), 0) + 1,
       'high', true
  from public.gc_units u
 where u.name ilike 'School of%'
   and not exists (select 1 from public.gc_concerns c where c.unit_id = u.id and lower(c.name) = 'dean concern');

insert into public.gc_concerns (unit_id, name, sort_order, default_priority, escalate_to_director)
select u.id, 'Schedule conflict or change',
       coalesce((select max(sort_order) from public.gc_concerns c where c.unit_id = u.id), 0) + 1,
       'normal', false
  from public.gc_units u
 where u.name ilike 'School of%'
   and not exists (select 1 from public.gc_concerns c where c.unit_id = u.id and lower(c.name) = 'schedule conflict or change');

-- ---------------------------------------------------------
-- 5. Escalate a case to its department director (concern flagged "auto-escalate").
--    SERVER-ONLY: called by api/escalate-to-director.js and the daily job with the
--    service-role key, never from the browser (it returns the full case details
--    that go into the director's email).
--    Idempotent: only the first call does anything and returns details.
-- ---------------------------------------------------------
create or replace function public.gc_escalate_to_director(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.gc_complaints;
  r record;
  v_code text;
  v_identity jsonb;
begin
  c := public.gc_find_complaint_by_ref(p_ref);
  if c.id is null then return jsonb_build_object('escalated', false, 'reason', 'not_found'); end if;
  if c.concern_id is null then return jsonb_build_object('escalated', false, 'reason', 'no_concern'); end if;

  select k.escalate_to_director as flag, k.name as kname, u.name as uname, d.name as dname, d.director_email as demail
    into r
    from public.gc_concerns k
    join public.gc_units u on u.id = k.unit_id
    join public.gc_departments d on d.id = u.department_id
   where k.id = c.concern_id;
  if not found or not r.flag then return jsonb_build_object('escalated', false, 'reason', 'not_flagged'); end if;
  if c.director_escalated_at is not null then return jsonb_build_object('escalated', true, 'already', true); end if;
  if r.demail is null then return jsonb_build_object('escalated', false, 'reason', 'no_director_email'); end if;

  select * into c from public.gc_complaints where id = c.id for update;
  if c.director_escalated_at is not null then return jsonb_build_object('escalated', true, 'already', true); end if;

  v_code := coalesce(c.office_access_code, public.gc_generate_office_code());

  update public.gc_complaints
     set office_forward_email    = r.demail,
         office_access_code      = v_code,
         office_forwarded_at     = now(),
         office_last_activity_at = null,
         office_last_reminder_at = null,
         office_reminder_count   = 0,
         director_escalated_at   = now(),
         director_escalation_reason = 'concern',
         status = case
                    when c.type = 'complaint' and c.status in ('received','under_review','in_progress') then 'escalated'
                    when c.type = 'feedback'  and c.status = 'received' then 'forwarded'
                    else c.status end
   where id = c.id;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (c.id, 'system', 'System', 'director_escalation',
          'Automatically escalated to the ' || r.dname || ' director (' || r.demail || ') because the concern is "' || r.kname
          || '". It was not sent to ' || r.uname || '.', false);

  v_identity := case when c.is_anonymous then jsonb_build_object('is_anonymous', true) else jsonb_build_object(
    'is_anonymous', false,
    'complainant_name', c.complainant_name, 'student_id', c.student_id, 'complainant_email', c.email,
    'contact_no', c.contact_no, 'program', c.program, 'year_level', c.year_level) end;

  return jsonb_build_object(
    'escalated', true, 'to_email', r.demail, 'code', v_code, 'reference_no', c.reference_no,
    'type', c.type, 'department', r.dname, 'unit', r.uname, 'concern', r.kname,
    'incident_date', c.incident_date, 'incident_location', c.incident_location,
    'respondent', c.respondent, 'desired_outcome', c.desired_outcome,
    'subject', c.subject, 'description', c.description)
    || v_identity;
end $$;
revoke all on function public.gc_escalate_to_director(text) from public, anon, authenticated;
grant execute on function public.gc_escalate_to_director(text) to service_role;
