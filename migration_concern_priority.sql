-- =====================================================================
-- NUplift: Campus Feedback and Action Portal: migration
--   PER-CONCERN DEFAULT PRIORITY
--
--   • Every concern (Department > Unit > Concern) gets an editable
--     "default priority": low / normal (shown as "Medium") / high / urgent.
--     Admins change it in Offices & Concerns.
--   • When a student files a complaint/feedback, the new case is
--     automatically given the priority of the concern they picked
--     (e.g. "ID concerns" -> Low, "Computer / laboratory concerns" -> Medium).
--   • Staff can still override it with the Priority dropdown on the case.
--     Once someone changes it by hand it is never touched again.
--   • If an admin re-routes a case to a different concern and nobody has
--     set its priority by hand, it takes the new concern's default.
--   • Changing a concern's default only affects NEW cases (and re-routes).
--
--   This file also TAGS ALL EXISTING CONCERNS with a sensible default
--   (see section 4). It does that only ONCE, the first time the column is
--   created, so re-running this file never overwrites what an admin edited.
--
-- RUN ORDER: after migration_office_routing.sql (any time after it; it does
--            not replace any of the submit functions, so it is safe to run
--            before or after the later migrations). Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------
-- priority_manual = true once a person has changed the priority by hand.
-- On first run, cases that already have a priority_change entry are marked.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'gc_complaints' and column_name = 'priority_manual') then
    alter table public.gc_complaints add column priority_manual boolean not null default false;
    update public.gc_complaints c set priority_manual = true
     where exists (select 1 from public.gc_updates u where u.complaint_id = c.id and u.kind = 'priority_change');
  end if;
end $$;

-- ---------------------------------------------------------
-- 2. Triggers
--    Separate triggers (not edits to gc_complaints_before_update) so later
--    re-runs of older migrations can't overwrite this behaviour.
-- ---------------------------------------------------------

-- 2a. New case -> take the concern's default priority
create or replace function public.gc_complaints_priority_bi()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_p text;
begin
  if new.concern_id is not null then
    select default_priority into v_p from public.gc_concerns where id = new.concern_id;
    if v_p is not null then new.priority := v_p; end if;
  end if;
  return new;
end $$;
revoke all on function public.gc_complaints_priority_bi() from public, anon, authenticated;

-- 2b. Existing case:
--     • priority changed by a person  -> remember it was set by hand
--     • re-routed to another concern and never set by hand -> new concern's default
create or replace function public.gc_complaints_priority_bu()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_p text;
begin
  if new.priority is distinct from old.priority then
    -- (the optional backfill in section 5 sets gc.priority_auto so it isn't counted as a manual change)
    if coalesce(current_setting('gc.priority_auto', true), '') <> 'on' then
      new.priority_manual := true;
    end if;
  elsif new.concern_id is not null
        and new.concern_id is distinct from old.concern_id
        and not old.priority_manual then
    select default_priority into v_p from public.gc_concerns where id = new.concern_id;
    if v_p is not null then new.priority := v_p; end if;
  end if;
  return new;
end $$;
revoke all on function public.gc_complaints_priority_bu() from public, anon, authenticated;

-- ---------------------------------------------------------
-- 3. Column on gc_concerns + tagging of existing concerns (first run only)
-- ---------------------------------------------------------
do $$
declare
  v_first boolean := not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'gc_concerns' and column_name = 'default_priority');
begin
  if v_first then
    alter table public.gc_concerns
      add column default_priority text not null default 'normal'
      check (default_priority in ('low','normal','high','urgent'));

    -- -------------------------------------------------------
    -- 4. Initial tags, matched on the concern's name (case-insensitive).
    --    Anything not listed stays Medium ("normal"), including every
    --    "Other concern". Edit any of these later in Offices & Concerns.
    --
    --    URGENT : safety / harassment, needs action right away
    --    HIGH   : welfare, health, conduct, money, grades, enrollment
    --    MEDIUM : everyday service problems (the default)
    --    LOW    : minor, convenience or informational concerns
    -- -------------------------------------------------------
    update public.gc_concerns c set default_priority = t.p
      from (values
        -- URGENT
        ('safety and security incident',              'urgent'),
        ('bullying or harassment',                    'urgent'),

        -- HIGH
        ('student welfare concern',                   'high'),
        ('counseling services',                       'high'),
        ('medical consultation and services',         'high'),
        ('instructor / faculty conduct',              'high'),
        ('faculty / staff conduct',                   'high'),
        ('security personnel conduct',                'high'),
        ('student council / officer conduct',         'high'),
        ('disciplinary case / process',               'high'),
        ('food quality and safety',                   'high'),
        ('grading and assessment',                    'high'),
        ('grades and records',                        'high'),
        ('enrollment',                                'high'),
        ('tuition and fees assessment',               'high'),
        ('refunds',                                   'high'),
        ('payments and receipts',                     'high'),

        -- LOW
        ('id concerns',                               'low'),
        ('lost and found',                            'low'),
        ('parking',                                   'low'),
        ('gate entry / id checking',                  'low'),
        ('merchandise / uniform availability',        'low'),
        ('pricing',                                   'low'),
        ('pricing and payment',                       'low'),
        ('announcements and social media content',    'low'),
        ('events and promotions',                     'low'),
        ('alumni records and services',               'low'),
        ('alumni events',                             'low'),
        ('industry partnerships',                     'low'),
        ('job placement and career services',         'low'),
        ('outreach program participation',            'low'),
        ('community service hours',                   'low'),
        ('seating and space',                         'low'),
        ('library facilities and noise',              'low'),
        ('borrowing and fines',                       'low'),
        ('equipment borrowing',                       'low'),
        ('uniform and dress code',                    'low'),
        ('reservations and schedule',                 'low'),
        ('policy / process improvement',              'low')
        -- everything else (e.g. "Computer / laboratory concerns", Wi-Fi,
        -- email / NU account, classroom conditions, repairs, curriculum,
        -- academic advising, document requests, staff service, "Other concern")
        -- stays 'normal' = Medium
      ) as t(n, p)
     where lower(btrim(c.name)) = t.n;
  end if;
end $$;

-- Triggers are created last so the tagging above can't fire anything.
drop trigger if exists gc_complaints_priority_bi on public.gc_complaints;
create trigger gc_complaints_priority_bi
  before insert on public.gc_complaints
  for each row execute function public.gc_complaints_priority_bi();

drop trigger if exists gc_complaints_priority_bu on public.gc_complaints;
create trigger gc_complaints_priority_bu
  before update on public.gc_complaints
  for each row execute function public.gc_complaints_priority_bu();

-- ---------------------------------------------------------
-- 5. OPTIONAL: apply the new defaults to cases that are already open.
--    Off by default (existing cases keep the priority they have). To use it,
--    remove the two comment markers (/* and */) and run just this part once.
--    It only touches open cases whose priority nobody ever changed by hand.
-- ---------------------------------------------------------
/*
begin;
select set_config('gc.priority_auto', 'on', true);
update public.gc_complaints c
   set priority = k.default_priority
  from public.gc_concerns k
 where k.id = c.concern_id
   and not c.priority_manual
   and c.status in ('received','under_review','in_progress','escalated','forwarded')
   and c.priority is distinct from k.default_priority;
commit;
*/
