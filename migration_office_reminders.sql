-- =====================================================================
-- Council of Leaders Grievance System: migration
--   OFFICE STATUS ON ALL CASES + AUTO-REMINDERS + AUTO-CLOSE
--
--   1. Offices can now change the status of ANY case forwarded to them
--      (previously only confidential complaints) — feedback gets its own
--      status set (forwarded/noted), complaints get the usual set
--      (under_review/in_progress/resolved/closed).
--   2. Two columns track office activity so a scheduled job
--      (api/cron-followups.js, run by Vercel Cron — see vercel.json) can:
--        - email the office a reminder every 3 days it hasn't posted an
--          update or changed the status, repeating until the case reaches
--          a terminal status (resolved/closed/dismissed for complaints,
--          noted for feedback);
--        - auto-close a complaint that has sat at "resolved" for 3 days
--          with no follow-up from the complainant (a follow-up already
--          flips it back to under_review via gc_add_followup, so "still
--          resolved after 3 days" reliably means no one followed up).
--
-- RUN ORDER: after migration_confidential_complaints.sql. Safe to run
-- more than once.
-- =====================================================================

-- ---------------------------------------------------------
-- 1. Columns: office activity + reminder tracking
-- ---------------------------------------------------------
alter table public.gc_complaints add column if not exists office_last_activity_at timestamptz;
alter table public.gc_complaints add column if not exists office_last_reminder_at timestamptz;
alter table public.gc_complaints add column if not exists office_reminder_count   int not null default 0;

create index if not exists gc_complaints_office_followup_idx
  on public.gc_complaints(status) where office_forward_email is not null;

-- ---------------------------------------------------------
-- 2. New timeline entry kind, for the reminder audit trail
-- ---------------------------------------------------------
alter table public.gc_updates drop constraint if exists gc_updates_kind_check;
alter table public.gc_updates add  constraint gc_updates_kind_check check (kind in (
  'submitted','status_change','assignment','priority_change',
  'public_response','internal_note','follow_up','reassignment',
  'office_forward','office_update','office_redirect_request','office_reminder'));

-- ---------------------------------------------------------
-- 3. Office posts a message update — now also stamps office activity
--    (resets the 3-day reminder clock) and notifies the complainant,
--    same as when Council staff post a public reply.
--    (Return type changes void -> jsonb, so the function must be dropped
--    first — CREATE OR REPLACE cannot change a function's return type.)
-- ---------------------------------------------------------
drop function if exists public.gc_office_submit_update(text, text, text);
create function public.gc_office_submit_update(p_ref text, p_code text, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
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

  update public.gc_complaints set office_last_activity_at = now() where id = c.id;

  if c.email is not null then
    return jsonb_build_object('notify', true, 'to_email', c.email, 'name', c.complainant_name,
      'tracking_code', c.tracking_code, 'message', v_msg);
  end if;
  return jsonb_build_object('notify', false);
end $$;
revoke all on function public.gc_office_submit_update(text, text, text) from public, anon, authenticated;
grant execute on function public.gc_office_submit_update(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------
-- 4. Office updates the status of ANY case forwarded to it (no longer
--    limited to confidential complaints). Also stamps office activity.
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

  if c.type = 'complaint' then
    if p_status not in ('under_review','in_progress','resolved','closed') then
      raise exception 'Choose a valid status.';
    end if;
  else
    if p_status not in ('forwarded','noted') then
      raise exception 'Choose a valid status.';
    end if;
  end if;

  update public.gc_complaints
     set status = p_status, office_last_activity_at = now()
   where id = c.id;

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

-- ---------------------------------------------------------
-- 5. Staff-facing view: add the three new columns so the staff app
--    (which reads gc_staff_complaints with select('*')) can show
--    reminder status. Column list otherwise unchanged from
--    migration_confidential_complaints.sql.
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
  office_last_activity_at, office_last_reminder_at, office_reminder_count,
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
-- 6. NOTE on api/cron-followups.js (the scheduled reminder/auto-close job):
--    it reads and writes gc_complaints directly using the
--    SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS entirely — so it does
--    NOT need its own RPC function or grants here. See that file for the
--    3-day reminder + auto-close logic, and vercel.json for the schedule.
-- =====================================================================
