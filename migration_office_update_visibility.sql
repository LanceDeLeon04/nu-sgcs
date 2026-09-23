-- =====================================================================
-- Council of Leaders Grievance System: migration
--   Make office updates reach the student (public timeline entry + email)
--
-- RUN ORDER: ... -> migration_office_forwarding.sql -> THIS FILE
-- Safe to run more than once.
-- =====================================================================

-- 1. office_update is now public (shows on the student's /track/<code> page)
create or replace function public.gc_updates_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is not null then
    new.author_name := coalesce(public.gc_staff_name(new.author_id), new.author_name);
  end if;
  new.is_public := new.kind in ('submitted','status_change','public_response','follow_up','reassignment','office_update');
  return new;
end $$;
revoke all on function public.gc_updates_before_insert() from public, anon, authenticated;

-- 2. gc_office_submit_update now returns what the client needs to also
--    email the student (mirrors the staff "reply" notification). Only
--    returned to the caller who already proved they hold the 4-digit code.
create or replace function public.gc_office_submit_update(p_ref text, p_code text, p_message text)
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
  values (c.id, 'office', coalesce(c.office_unit, 'Office'), 'office_update',
          'Update from ' || coalesce(c.office_unit, 'the office') || ': ' || v_msg, true);

  if c.type = 'complaint' and c.email is not null then
    return jsonb_build_object(
      'notify', true, 'to_email', c.email, 'name', c.complainant_name,
      'tracking_code', c.tracking_code, 'message', v_msg);
  end if;

  return jsonb_build_object('notify', false);
end $$;
revoke all on function public.gc_office_submit_update(text, text, text) from public, anon, authenticated;
grant execute on function public.gc_office_submit_update(text, text, text) to anon, authenticated;

-- 3. Student's tracking page: label office authors properly instead of falling back to "System"
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
               'author', case u.author_type
                            when 'staff' then 'Council of Leaders'
                            when 'complainant' then 'You'
                            when 'office' then coalesce(c.office_unit, 'Concerned office')
                            else 'System' end,
               'message', u.message,
               'from_status', u.from_status,
               'to_status', u.to_status,
               'created_at', u.created_at) order by u.created_at)
      from public.gc_updates u where u.complaint_id = c.id and u.is_public
    ), '[]'::jsonb)
  );
end $$;
grant execute on function public.gc_track_complaint(text) to anon, authenticated;
