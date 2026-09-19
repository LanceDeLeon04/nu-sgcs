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
   RLS policy and the `gc-evidence` storage bucket. Nothing else needs deploying — there are no Edge Functions.
   Safe to re-run; it only touches `gc_*` objects.
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

## Customizing

- Categories: `src/lib/constants.js` **and** the `v_categories` array in `gc_submit_complaint()` / `gc_submit_feedback()` (keep in sync).
- Notice wording shown to students: `FEEDBACK_NOTICE` and `COMPLAINT_NOTICE` in `src/lib/constants.js`.
- "Overdue" threshold: `OVERDUE_DAYS` in `src/lib/constants.js`.
- Branding files in `public/`: `COLLogo.png` (header, sidebar, login; transparent gold), `SCSLogo.png` (credit footer), `favicon.png`, `LogInBG.png`. Replace them using the same filenames.
- Footer text lives in `src/components/Footer.jsx`.
