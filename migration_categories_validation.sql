-- =====================================================================
-- Council of Leaders Grievance System: migration
--   1. 4 primary categories + sub-categories (complaints)
--   2. Student ID format   20XX-XXXXXXX
--   3. NU email only       @student.nu-laguna.edu.ph
--   4. Offensive-language filter (feedback = blocked, complaints = flagged for staff)
--
-- HOW TO RUN: Supabase Dashboard > SQL Editor > paste this whole file > Run.
-- Safe to run more than once. Existing complaints are re-mapped automatically.
-- =====================================================================

-- ---------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------
alter table public.gc_complaints add column if not exists subcategory text;
alter table public.gc_complaints add column if not exists flagged_language boolean not null default false;

-- ---------------------------------------------------------
-- 2. Re-map EXISTING complaints from the old 11 categories to primary + sub-category.
--    (Feedback rows keep their own category list.) The before-update trigger is paused
--    so updated_at is not bumped on old records.
-- ---------------------------------------------------------
alter table public.gc_complaints disable trigger gc_complaints_before_update;

update public.gc_complaints set
  subcategory = category,
  category = case category
    when 'Academic Concern'                  then 'Academic Concerns'
    when 'Instructor / Faculty Conduct'      then 'Academic Concerns'
    when 'Harassment or Bullying'            then 'Student Welfare'
    when 'Discrimination'                    then 'Student Welfare'
    when 'Safety & Security'                 then 'Student Welfare'
    when 'Facilities & Services'             then 'Administrative Issues'
    when 'Fees & Financial Concern'          then 'Administrative Issues'
    when 'Office / Administrative Service'   then 'Administrative Issues'
    when 'Student Council / Officer Conduct' then 'Others'
    when 'Student Organization Concern'      then 'Others'
    when 'Other'                             then 'Others'
  end
where type = 'complaint'
  and subcategory is null
  and category in (
    'Academic Concern','Instructor / Faculty Conduct','Harassment or Bullying','Discrimination',
    'Safety & Security','Facilities & Services','Fees & Financial Concern',
    'Office / Administrative Service','Student Council / Officer Conduct',
    'Student Organization Concern','Other');

alter table public.gc_complaints enable trigger gc_complaints_before_update;

-- ---------------------------------------------------------
-- 3. Offensive-language check (server-side backstop for the browser filter).
--    Whole-word matching only, so words like "class" or "assess" never trigger.
--    Handles: uppercase, repeated letters (fuuuck), leetspeak (sh1t, b!tch, @sshole),
--    and two-word spellings (tang ina, pak yu). Edit the list below to add/remove words.
-- ---------------------------------------------------------
create or replace function public.gc_has_profanity(p_text text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  s     text;
  v_pat text;
  v_words text[] := array[
    'fuck', 'fucks', 'fucked', 'fucking', 'fucker', 'fuckers', 'motherfucker', 'fuk',
    'fuq', 'fcuk', 'shit', 'shits', 'shitty', 'bullshit', 'shet', 'bitch',
    'bitches', 'bitchy', 'bastard', 'bastards', 'asshole', 'assholes', 'dickhead', 'cunt',
    'pussy', 'slut', 'whore', 'douche', 'douchebag', 'nigger', 'nigga', 'faggot',
    'retard', 'retarded', 'putangina', 'putanginamo', 'tangina', 'tanginamo', 'tanginang', 'puta',
    'putang', 'pota', 'potah', 'gago', 'gagu', 'tarantado', 'tarantada', 'ulol',
    'bobo', 'tanga', 'siraulo', 'kupal', 'punyeta', 'puneta', 'pucha', 'lintik',
    'buwisit', 'bwisit', 'pakyu', 'pakshet', 'pakingshet', 'hindot', 'kantot', 'kantutan',
    'pekpek', 'burat', 'walanghiya', 'gunggong', 'engot'
  ];
begin
  if p_text is null or btrim(p_text) = '' then return false; end if;

  s := lower(p_text);
  s := regexp_replace(s, '[!|+.,;:?]+(?=\s|$)', '', 'g');         -- trailing punctuation ("shit!")
  s := translate(s, '@$!|+04315789', 'asiitoaeistbg');            -- leetspeak
  s := regexp_replace(s, '(.)\1+', '\1', 'g');                     -- fuuuck -> fuck

  select string_agg(regexp_replace(w, '(.)\1+', '\1', 'g'), '|') into v_pat from unnest(v_words) as w;
  v_pat := v_pat || '|tang\s+ina|putang\s+ina|pak\s+yu|walang\s+hiya';

  return s ~ ('(^|[^a-z])(' || v_pat || ')($|[^a-z])');
end $$;

revoke all on function public.gc_has_profanity(text) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 4. Submit complaint: sub-categories, student ID, NU email, language flag
-- ---------------------------------------------------------
create or replace function public.gc_submit_complaint(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_anon      boolean := coalesce((p->>'is_anonymous')::boolean, false);
  v_sid       uuid    := nullif(p->>'submission_id','')::uuid;
  v_category  text    := btrim(coalesce(p->>'category',''));
  v_subcat    text    := btrim(coalesce(p->>'subcategory',''));
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
  -- 4 primary categories -> allowed sub-categories (keep in sync with src/lib/constants.js)
  v_groups jsonb := '{
    "Academic Concerns":     ["Academic Concern","Instructor / Faculty Conduct"],
    "Student Welfare":       ["Harassment or Bullying","Discrimination","Safety & Security"],
    "Administrative Issues": ["Facilities & Services","Fees & Financial Concern","Office / Administrative Service"],
    "Others":                ["Student Council / Officer Conduct","Student Organization Concern","Other"]
  }'::jsonb;
begin
  if not (v_groups ? v_category) then
    raise exception 'Please choose a valid category.';
  end if;
  if not ((v_groups -> v_category) ? v_subcat) then
    raise exception 'Please choose a valid sub-category.';
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
  if v_student !~ '^20[0-9]{2}-[0-9]{7}$' then
    raise exception 'Student ID must follow this format: 20XX-XXXXXXX (e.g. 2024-0123456).';
  end if;
  if v_email is null or v_email !~* '^[^@[:space:]]+@student\.nu-laguna\.edu\.ph$' then
    raise exception 'Please use your NU student email (@student.nu-laguna.edu.ph) so a representative can reach you on Microsoft Teams.';
  end if;
  if jsonb_typeof(coalesce(p->'attachments','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p->'attachments','[]'::jsonb)) > 3 then
    raise exception 'You can attach up to 3 files.';
  end if;

  -- Complaints are never rejected for strong language (people may need to quote what was said),
  -- but staff are alerted with a flag.
  v_flag := public.gc_has_profanity(concat_ws(' ', v_subject, v_desc, p->>'respondent', p->>'desired_outcome'));

  v_code := public.gc_generate_tracking_code();

  insert into public.gc_complaints (
    reference_no, tracking_code, is_anonymous,
    complainant_name, student_id, email, contact_no, program, year_level,
    category, subcategory, flagged_language, subject, description, incident_date, incident_location, respondent, desired_outcome
  ) values (
    public.gc_next_reference('GC'), v_code, false,
    left(v_name, 150),
    v_student,
    left(lower(v_email), 200),
    left(nullif(btrim(coalesce(p->>'contact_no','')), ''), 50),
    left(nullif(btrim(coalesce(p->>'program','')), ''), 150),
    left(nullif(btrim(coalesce(p->>'year_level','')), ''), 50),
    v_category, v_subcat, v_flag, v_subject, v_desc,
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

-- ---------------------------------------------------------
-- 5. Submit feedback: student ID / NU email (when provided), language block
-- ---------------------------------------------------------
create or replace function public.gc_submit_feedback(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_anon     boolean := coalesce((p->>'is_anonymous')::boolean, false);
  v_category text    := btrim(coalesce(p->>'category',''));
  v_subject  text    := btrim(coalesce(p->>'subject',''));
  v_msg      text    := btrim(coalesce(p->>'description',''));
  v_name     text    := nullif(btrim(coalesce(p->>'complainant_name','')), '');
  v_email    text    := nullif(btrim(coalesce(p->>'email','')), '');
  v_student  text    := nullif(btrim(coalesce(p->>'student_id','')), '');
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
    if v_student is not null and v_student !~ '^20[0-9]{2}-[0-9]{7}$' then
      raise exception 'Student ID must follow this format: 20XX-XXXXXXX (e.g. 2024-0123456).';
    end if;
    if v_email is not null and v_email !~* '^[^@[:space:]]+@student\.nu-laguna\.edu\.ph$' then
      raise exception 'Please use your NU student email (@student.nu-laguna.edu.ph), or leave it blank.';
    end if;
  end if;
  -- Feedback is blocked (not just flagged) when it contains offensive language.
  if public.gc_has_profanity(concat_ws(' ', v_subject, v_msg, p->>'respondent')) then
    raise exception 'Your message contains language that is not allowed. Please rephrase it respectfully and try again.';
  end if;

  v_ref := public.gc_next_reference('FB');

  insert into public.gc_complaints (
    type, reference_no, tracking_code, is_anonymous,
    complainant_name, student_id, email, program, year_level,
    category, subject, description, respondent
  ) values (
    'feedback', v_ref, null, v_anon,
    case when v_anon then null else left(v_name, 150) end,
    case when v_anon then null else v_student end,
    case when v_anon then null else left(lower(v_email), 200) end,
    case when v_anon then null else left(nullif(btrim(coalesce(p->>'program','')), ''), 150) end,
    case when v_anon then null else left(nullif(btrim(coalesce(p->>'year_level','')), ''), 50) end,
    v_category, v_subject, v_msg,
    left(nullif(btrim(coalesce(p->>'respondent','')), ''), 200)   -- office / person the feedback is about
  ) returning id into v_id;

  insert into public.gc_updates (complaint_id, author_type, author_name, kind, message, is_public)
  values (v_id, 'system', 'System', 'submitted', 'Feedback received.', false);

  return v_ref;
end $$;

-- ---------------------------------------------------------
-- 6. Tracking page also returns the sub-category
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

-- Grants are unchanged by "create or replace", restated for safety:
grant execute on function public.gc_submit_complaint(jsonb) to anon, authenticated;
grant execute on function public.gc_submit_feedback(jsonb)  to anon, authenticated;
grant execute on function public.gc_track_complaint(text)   to anon, authenticated;
