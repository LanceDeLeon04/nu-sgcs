# Council of Leaders — Student Grievance and Complaints System

An independent complaints system built on the SCS File Repository's stack and look
(React + Vite + Tailwind + Supabase, NU Blue / NU Gold). It uses the **same Supabase project**
as the SCS system but its **own separate tables** — everything is prefixed `gc_`, plus one private
storage bucket, `gc-evidence`. It never reads or changes any SCS table.

## Two kinds of submission

| | **Feedback** | **Formal Complaint** |
|---|---|---|
| Identity | **Anonymous option** (name/email optional) | **Required** — full name, student ID, NU email |
| Purpose | Filing and reporting only; forwarded to the concerned office(s) | Actual resolution and trackable actions |
| Tracking | None (sender gets a reference like `FB-2026-0001` for their records) | Private tracking code (`GC-XXXX-XXXX-XXXX`), status page, replies, follow-ups, rating |
| Evidence files | No | Up to 3 |
| Staff workflow | Received → Forwarded (to an office) → Noted | Received → Under Review → In Progress / Escalated → Resolved → Closed (or Dismissed) |
| Notice shown | "Feedback is for filing and reporting only… forwarded to the concerned offices… for actual resolutions and trackable actions, use a formal complaint." | "A representative may contact you via Microsoft Teams to confirm the details of your report. Complaints are trackable." |

Both live in the same `gc_complaints` table (`type` = `feedback` | `complaint`); rules are enforced in the database,
not just the UI (anonymous complaints are rejected server-side; a complaint can't take a feedback status and vice versa).

## Office self-service + automatic follow-ups

Once a case is forwarded, the concerned office's secure link (`/office/:ref`, 4-digit code) lets it both post
updates **and change the status itself** (complaints: Under Review / In Progress / Resolved / Closed; feedback:
Forwarded / Noted) — the Council no longer has to relay status changes on the office's behalf.

A daily scheduled job (`api/cron-followups.js`, run by Vercel Cron — see `vercel.json`) then keeps things moving
without anyone watching the queue:
- **Reminders** — if a forwarded case sees no office activity (no update posted, no status change) for 3 days,
  the office gets an emailed reminder with its secure link. This repeats every 3 days until the case reaches a
  terminal status (resolved/closed/dismissed for complaints, noted for feedback).
- **Auto-close** — a complaint left at "Resolved" for 3 days with no follow-up from the complainant is
  automatically moved to "Closed" (a follow-up reopens it to "Under Review" immediately, so this only fires
  when nobody responded).

Needs `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` set in Vercel's Environment Variables in addition to the
`BREVO_*` vars — see `.env.example` for details.

## What it does

**Public (no account):**
- `/` landing page · `/submit` chooser · `/submit/feedback` · `/submit/complaint`
- `/track` look up a *complaint* with its private tracking code → status, progress, council replies,
  send follow-ups, rate the outcome. Follow-up on a *resolved* complaint reopens it.

**Staff (sign in at `/staff/login`):**
- Dashboard (complaints: new / active / overdue / resolved; feedback waiting to be forwarded; by status and category; satisfaction score)
- **Complaints & Feedback** list with type tabs + search + filters (status, category, priority, assignee)
- Complaint detail: change status/priority, assign, write the outcome summary, reply publicly or leave
  internal notes, open evidence via short-lived signed links, "Open in Microsoft Teams" for the complainant, full audit timeline
- Feedback detail: record which office it was forwarded to (auto-marks it *Forwarded*), internal notes, assign
- Assign any item to a specific staff member ("Assign to me" shortcut; filter the list by assignee); admins also manage staff, delete, see tracking codes

**Roles:** `admin` and `handler`. Any staff member can assign a complaint or feedback item to any active staff member (or take it themselves);
admins additionally delete items and manage staff. Being signed in is not enough — an active row in `gc_staff` is required.

**Upgrading an existing install:** just re-run the new `schema.sql`. It contains an in-place migration
(adds the feedback type, statuses and `forwarded_to`; keeps all existing data; anonymous complaints filed
before this version are left untouched).

## Setup (new, separate Supabase project)

1. **Create a Supabase project** (supabase.com → New project). Wait until it finishes provisioning.
2. **Connect the app** — Project Settings → API. Copy the **Project URL** and the **publishable (anon) key**
   into `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   Restart `npm run dev` after editing `.env`. On Vercel/Netlify add the same two variables under
   Environment Variables and redeploy. (Without them the app shows a "Supabase isn't connected" screen.)
3. **Database** — SQL Editor → paste all of `schema.sql` → Run. This creates every table, function, trigger,
   RLS policy and the `gc-evidence` storage bucket. Then run the migration files in order (each file's own
   header states the exact order); the most recent is `migration_office_reminders.sql`. Nothing needs deploying
   as Edge Functions — the scheduled job runs as a Vercel Cron hitting a normal serverless route (`api/cron-followups.js`).
   Safe to re-run any of these; they only touch `gc_*` objects.
4. **First admin** — `schema.sql` already creates a built-in admin: username **`ADMIN_COL`**, password **`COL2026-2027`**
   (a real Supabase Auth account, stored hashed; change the password in Settings after first sign-in).
   To create additional admins, pick one:
   - `npm run create-staff -- you@example.com "Password" "Full Name" "Position" admin`
     (put the project's **service_role/secret key** in `.env` as `SUPABASE_SERVICE_ROLE_KEY`; local only), **or**
   - No Node: Dashboard → Authentication → Users → *Add user* (tick *Auto Confirm User*), then run in the SQL Editor:
     ```sql
     insert into public.gc_staff (user_id, full_name, email, position, role)
     select id, 'Your Name', email, 'Council President', 'admin'
     from auth.users where email = 'you@example.com';
     ```
   (`seed_staff_from_scs.sql` is only for reusing an existing SCS project's admins; skip it on a new project.)
5. **Run** — `npm install && npm run dev` → http://localhost:5174, staff sign in at `/staff/login`.
6. **Deploy** — `npm run build`, deploy `dist/` (Vercel config included).
   - **Email notifications** (confirmation on submit, status updates, and staff replies) are sent
     server-side by `api/send-email.js` (a Vercel serverless function) via Brevo's free transactional
     email API — 300 emails/day, no domain verification needed. Sign up at brevo.com, grab an API key
     under *SMTP & API*, and verify a sender email under *Senders*. Add `BREVO_API_KEY`,
     `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` to Vercel's Environment Variables (see
     `.env.example`) and redeploy. Feedback (which can be anonymous) never gets emailed — only
     formal complaints, since they require an NU email address.
7. Add more staff under **Manage Staff → Create account**: type a username (or email), name, role and a password (or click Generate).
   The login is created for you — no dashboard or scripts needed. Admins can also reset a staff member's password there.

Using the same project as the SCS File Repository instead also works: put that project's URL/key in `.env`
and use `seed_staff_from_scs.sql` for step 4.

## Data model

| Table | Purpose |
|---|---|
| `gc_staff` | Who may use the staff side (links to `auth.users`), role + active flag |
| `gc_complaints` | The complaints (identity fields are null for anonymous ones) |
| `gc_updates` | Timeline/audit: status changes, assignments, replies, internal notes, follow-ups |
| `gc_attachments` | Evidence file metadata (files live in the private `gc-evidence` bucket) |
| `gc_ref_counters` | Per-year counter for staff reference numbers (`GC-2026-0001`) |

## Security notes

- The anonymous site has **no direct table access**. It uses `SECURITY DEFINER` RPCs
  (`gc_submit_complaint`, `gc_track_complaint`, `gc_add_followup`, `gc_rate_resolution`) that validate
  input in SQL — the same pattern as the SCS public submission forms.
- Tracking codes (`GC-XXXX-XXXX-XXXX`, 48 random bits) are the only key to a complaint. The tracking page
  never reveals internal notes, staff names or identity fields.
- Anonymous feedback stores **no** name/email/ID, enforced server-side. Formal complaints cannot be anonymous.
- Staff can change only `status`, `priority`, `assigned_to` and `resolution_summary` (column-level grant);
  everything else is immutable. Every change is logged automatically by triggers.
- Evidence bucket: private, 5 MB, JPG/PNG/WebP/PDF only; anyone may upload under `submissions/`, only
  active staff can read.
- Spam protection is basic (honeypot + server validation). If abuse appears, add Cloudflare Turnstile
  or a rate limit at the edge.
- Conflict of interest: all staff can see all complaints, including ones about council officers. Keep
  the handler list small and use "Person / office concerned" to route sensitive cases to an admin.
- The SCS login page has a hard-coded bypass account in `src/lib/auth.jsx`. It was **not** copied here.

## Handbook Assistant (no external API, nothing to run out)

A floating "Ask about school policy" widget appears on every public page (`ChatWidget.jsx`, mounted in
`PublicShell.jsx` and `Landing.jsx`). It's a guided drill-down + keyword search, not an AI chatbot —
no API key, no per-question cost, nothing that can run out of credits:

1. **Pick a topic** — the 14 top-level categories in `src/data/handbookIndex.js` (one per handbook
   Section, built from the handbook's own table of contents: Academics & Enrollment, Student
   Discipline, Student Grievance, Tuition & Fees, Scholarships, IT Services, etc.).
2. **Narrow to a specific concern** — the lettered subtopics under that category (e.g. under
   "Academics & Enrollment": Grading System, Leave of Absence and Readmission, Rules on Attendance,
   ...), or "search all of this section" if none quite fits.
3. **Type keywords** — `src/lib/handbookSearch.js` runs a weighted keyword-overlap search over only
   the handbook chunks whose pages fall inside the picked subtopic's range, and shows the matching
   excerpt(s) as-is with the section name and page number cited. If nothing scores in that narrow
   scope, it automatically falls back to searching the whole handbook and says so. Everything runs
   client-side in the browser — no server round-trip.

Files:
- `src/data/handbook_chunks.json` — the handbook split into ~318 page-tagged text chunks (each also
  tagged with its Section name during pre-processing).
- `src/data/handbookIndex.js` — the 14 categories and their lettered subtopics with starting page
  numbers, hand-built from the handbook's table of contents.
- `src/lib/handbookSearch.js` — tokenizing, page-range scoping, and keyword scoring.
- `src/components/ChatWidget.jsx` — the category → subtopic → search UI (3 steps, with breadcrumbs
  and a back button at each level).

**Updating the handbook:** when a new edition is published, re-extract/re-chunk the PDF into
`handbook_chunks.json` (page + text + section per chunk), then update the section start pages and any
renamed/reordered subtopics in `handbookIndex.js` to match the new table of contents. No other code
changes are needed.

**Trade-off to know:** this surfaces the actual handbook passage(s), not a generated conversational
answer — it won't paraphrase or combine multiple sections into one sentence the way an LLM would. If
you ever want that layered on top later, an optional AI-summarization step could be added on top of
these same search results, but this setup works fully on its own with zero ongoing cost or dependency
on any outside service.

## Office routing (Department › Unit › Concern)

The submission form routes each complaint/feedback to a **Department › Unit › Concern**, e.g.
`Administration/Executive › IT Services Office › Email concerns`. Students can also pick
**"I'm not sure"**, which shows a live search box over every concern in every department; if
they still don't find a match, the submission is saved as **Not yet routed** for an admin to sort.

- **Run once** (after `schema.sql` and `migration_categories_validation.sql`):
  SQL Editor → paste `migration_office_routing.sql` → Run. It creates the directory tables
  (`gc_departments`, `gc_units`, `gc_concerns`), seeds them with a starter directory (only if the
  directory is empty), and updates `gc_submit_complaint` / `gc_submit_feedback` / `gc_track_complaint`.
- **Manage it** — staff app → **Offices & Concerns** (admins only): add, rename, hide, or delete
  departments/units/concerns. Renaming updates every existing submission that used that item
  automatically; hiding removes it from the student form without touching past submissions.
- **Fix a wrong office** — open any submission → Admin panel → *Wrong office? Change it* (or
  *Route this to an office* for an unrouted one). Pick the correct Department › Unit › Concern and
  save; the student is notified by email (and sees it on their tracking page, for complaints).

## Full report details on forwarding

The forwarding email (and the office's secure `/office/:ref` portal) include the **complete report**:
department › unit › concern, incident date/location, "concerned person/office", desired outcome, and
the **reporting student's identity** (name, student ID, NU email, contact no., program, year level).
Anonymous feedback still shows "Filed anonymously — no identity on file" instead — formal complaints
are never anonymous, so their reporter's identity is always included.

- **Run once** (after `migration_office_forwarding.sql`): SQL Editor → paste
  `migration_office_forward_full_details.sql` → Run. Safe to re-run.
- **Heads-up:** this removes the earlier privacy safeguard where the office never learned who filed
  the case (useful when the "concerned person/office" might be someone at that same office). If that
  matters for your institution, keep an eye on which units get sensitive respondent-vs-office
  situations, or restrict who fills in unit emails.

## Unit emails

Each unit can have an **office email** and a **unit head email** (both optional), set by admins
in **Offices & Concerns**. When staff open a ticket, if the routed unit has neither email on file
they see a clear warning ("no email on file — follow up and forward this concern manually") so
nothing silently falls through the cracks; if at least one is set, both are shown right on the
ticket for easy copy-paste.

- **Run once** (after the migrations above): SQL Editor → paste `migration_unit_emails.sql` → Run.
- **Set them** — staff app → **Offices & Concerns** → expand a unit → fill in the office email
  and/or unit head email → Save.

### Department director email (required)

Every department **must** have a director email.

- **Run once** (after `migration_office_forward_full_details.sql`): SQL Editor → paste
  `migration_department_director_email.sql` → Run. It backfills from an existing unit head email
  where one exists; any department still blank shows a red **Director email required** badge.
- **Set it** — staff app → **Offices & Concerns** → expand a department → *Department director
  email* → Save. New departments can't be added without one, and the database rejects saving a
  department with a blank/invalid director email.
- **Weekly summary, not per-case** — the director is *not* copied on individual concerns. Every
  **Friday 5:00 PM (PH)** (`/api/cron-weekly-digest`, schedule in `vercel.json`, UTC) each director
  gets one summary email of that department's concerns from the past 7 days: counts by status, a
  list (reference no., type, status, subject, unit › concern), and how many older complaints are
  still open. Departments with no new concerns that week get nothing. Confidential cases are listed
  without details and reporter identities are never included. A `gc_digest_log` row prevents a
  retried cron from sending the same week twice.
- **Report link with charts** — every summary email has a **"View the full weekly report"** button
  (plus a plain-text fallback link) to `/report/<token>`: KPIs, an 8-week volume trend, status
  donut, open-by-priority, concerns-by-unit and the case list. The link is signed (HMAC, no login,
  no DB table), valid 60 days, and shows no reporter identities; confidential cases have no details.
  Signing key: `REPORT_LINK_SECRET` (falls back to `CRON_SECRET`). Rotating it invalidates old links.
- **Send any range, any time (admins)** — staff app → **Weekly Reports**: pick a start/end date (or a
  preset such as *Last Mon–Sun week*), choose departments, then **Preview** (sends nothing, gives
  each department's report link) or **Send now**. It uses the same email + chart report as the Friday
  send, but is **not** logged in `gc_digest_log`, so the automatic Friday 5 PM send always still goes
  out. Ranges are PH dates, inclusive, up to 366 days; the end is capped at "now". The server
  (`/api/send-weekly-report`) re-checks that the caller is an active **admin**.
- **Preview without sending:** open `/api/cron-weekly-digest?dry=1` (with the `CRON_SECRET` bearer
  header if set) to see which directors would be emailed.

## Confidential complaints

Students filing a formal Complaint can check **"Mark as Confidential"**. When checked:

- Non-admin Council staff still see the case in their list/dashboard (reference no., status,
  priority, routing, dates) but the subject, description, identity, evidence, and timeline are
  hidden — they can't open, edit, or comment on it.
- Admins can still see and manage everything, exactly as before.
- The **concerned office** (via its existing secure `/office/:ref` + 4-digit code link) continues
  to see the full case as usual, and can now **update the status itself** from that page — normally
  only Council staff can change status, but a confidential case has no staff handler who can see it
  to do that.

Non-confidential complaints and all feedback are unaffected.

- **Run once** (after `migration_office_redirect_request.sql`): SQL Editor → paste
  `migration_confidential_complaints.sql` → Run. Safe to re-run. It adds the `is_confidential`
  column, a redacted `gc_staff_complaints` view (used by the staff Dashboard/Complaints/Detail
  pages instead of the raw table), tightens RLS on `gc_complaints` / `gc_updates` /
  `gc_attachments` / evidence storage so non-admin staff can't read a confidential case's content
  directly, and adds the `gc_office_update_status` RPC for the office portal.

## Evidence required on complaints

Formal complaints now require **at least one evidence attachment** (1–3 files: JPG, PNG, WebP or
PDF, 5 MB each). Feedback is unaffected — attachments there remain unavailable/optional as before.
Both the submission form and `gc_submit_complaint()` enforce this, so it can't be bypassed by
calling the RPC directly.

- **Run once** (after `migration_confidential_complaints.sql`): SQL Editor → paste
  `migration_evidence_required.sql` → Run. Safe to re-run.

## Staff profile pictures

Every staff member can upload, change, or remove their own profile picture under **Settings**. The
image is center-cropped to a square and shrunk to 256 px in the browser before upload, stored in a
private `gc-avatars` bucket (one folder per user), and shown to signed-in staff in the sidebar,
Settings, and Manage Staff via short-lived signed URLs. It is never shown on the public site.

- **Run once** (after `migration_evidence_required.sql`): SQL Editor -> paste
  `migration_staff_avatars.sql` -> Run. Safe to re-run. It adds `gc_staff.avatar_path`, creates the
  bucket with per-user write policies, and adds the `gc_set_my_avatar` RPC (non-admins can't update
  `gc_staff` directly).

## Customizing

- Categories: `src/lib/constants.js` **and** the `v_categories` array in `gc_submit_complaint()` / `gc_submit_feedback()` (keep in sync).
- Notice wording shown to students: `FEEDBACK_NOTICE` and `COMPLAINT_NOTICE` in `src/lib/constants.js`.
- "Overdue" threshold: `OVERDUE_DAYS` in `src/lib/constants.js`.
- Branding files in `public/`: `COLLogo.png` (header, sidebar, login; transparent gold), `SCSLogo.png` (credit footer), `favicon.png`, `LogInBG.png`. Replace them using the same filenames.
- Footer text lives in `src/components/Footer.jsx`.


## Unit codes and case numbers

Run `migration_unit_codes.sql` (after `migration_evidence_required.sql`). Every unit has an editable code (Offices & Concerns > open a unit > Unit code). New cases are numbered `GC-<UNIT>-0001` (complaints) and `FB-<UNIT>-0001` (feedback), e.g. `GC-ACCT-0001`. Unrouted cases use `UNR`. Old cases keep their old numbers. The private `GC-XXXX-XXXX-XXXX` tracking code is unchanged and is still what the public /track page uses.
