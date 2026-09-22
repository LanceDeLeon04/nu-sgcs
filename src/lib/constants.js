export const APP_NAME = 'Council of Leaders'
export const APP_SUBTITLE = 'Student Grievance and Complaints System'

// Routing: Department > Unit > Concern lives in the database (gc_departments / gc_units / gc_concerns)
// and is managed by admins in the staff app (Offices & Concerns). Nothing to edit here.
export const NOT_SURE = 'unsure' // the value of the "I'm not sure" option in the Department dropdown

// "Department › Unit › Concern" for a complaint/feedback row. Older rows (filed before office routing)
// fall back to their old "Category › Sub-category".
export const officeLabel = (c) => {
  if (c?.office_department) return [c.office_department, c.office_unit, c.office_concern].filter(Boolean).join(' › ')
  if (c?.office_unsure) return 'Not yet routed'
  return c?.subcategory ? `${c.category} › ${c.subcategory}` : c?.category || ''
}
export const categoryLabel = officeLabel
export const isUnrouted = (c) => !!c && !c.office_department && !!c.office_unsure

// Type of FEEDBACK (what kind of message it is). Where it goes is chosen with Department > Unit > Concern.
// Must match gc_submit_feedback() in migration_office_routing.sql
export const FEEDBACK_TYPES = ['Suggestion', 'Compliment / Commendation', 'Concern / Observation', 'Other']

export const TYPES = {
  complaint: { label: 'Complaint', cls: 'bg-nublue-600 text-white border-nublue-600' },
  feedback:  { label: 'Feedback',  cls: 'bg-nugold-100 text-nugold-700 border-nugold-300' },
}

// Wording shown to students on the public site
export const FEEDBACK_NOTICE =
  'Feedback is for filing and reporting only. It will be forwarded to the concerned offices, but it does not receive a resolution or trackable actions. If you want actual resolutions and trackable actions, please file a formal complaint instead.'
export const COMPLAINT_NOTICE =
  'A representative may contact you via Microsoft Teams to confirm the details of your report. Formal complaints are trackable: you will receive a tracking code to follow every action taken.'

export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Graduate']

/* The STUDENT's own school -> Program/Strand list ("Your details" section). Not the office the concern is about. */
export const DEPARTMENTS = [
  {
    name: 'Senior High School (SHS)',
    programs: [
      'Science, Technology, Engineering, and Mathematics (STEM)',
      'Accountancy, Business, and Management (ABM)',
      'Humanities and Social Sciences (HUMSS)',
      'Sports Track',
    ],
  },
  {
    name: 'School of Engineering and Architecture (SEA)',
    programs: [
      'Bachelor of Science in Civil Engineering (BSCE)',
      'Bachelor of Science in Computer Engineering (BSCpE)',
      'Bachelor of Science in Architecture (BS Arch)',
    ],
  },
  {
    name: 'School of Computer Studies (SCS)',
    programs: [
      'Bachelor of Science in Computer Science (BSCS)',
      'Bachelor of Science in Information Technology (BSIT)',
      'Bachelor of Science in Information Systems (BSIS)',
    ],
  },
  {
    name: 'School of Accountancy and Business Management (SABM)',
    programs: [
      'Bachelor of Science in Accountancy (BSA)',
      'Bachelor of Science in Accounting Information System (BSAIS)',
      'Bachelor of Science in Business Administration, Major in Marketing and Advertising (BSBA-MA)',
    ],
  },
  {
    name: 'School of Arts and Sciences (SAS)',
    programs: [
      'Bachelor of Arts in Communication (BA Communication)',
      'Bachelor of Science in Psychology (BS Psychology)',
      'Bachelor of Science in Criminology (BS Criminology)',
      'Bachelor of Multimedia Arts (BMA)',
      'Bachelor of Science in Exercise and Sports Science, Major in Fitness and Sports Coaching (BSESS)',
      'Bachelor of Science in Tourism Management (BSTM)',
    ],
  },
  {
    name: 'Graduate Studies',
    programs: [
      'Master in Management (MM)',
      'Master in Information Technology (MIT)',
      'Master of Arts in Education, Major in English (MAEd-English)',
      'Master of Arts in Education, Major in Filipino (MAEd-Filipino)',
      'Master of Arts in Education, Major in Special Education (MAEd-SPED)',
      'Master of Arts in Education, Major in Educational Management (MAEd-EM)',
      'Doctor of Education, Major in Educational Management (EdD-EM)',
    ],
  },
]
export const DEPARTMENT_NAMES = DEPARTMENTS.map((d) => d.name)
export const programsOf = (department) => DEPARTMENTS.find((d) => d.name === department)?.programs || []

export const STATUSES = {
  received:     { label: 'Received',     cls: 'bg-blue-50 text-blue-700 border-blue-200',       step: 0 },
  under_review: { label: 'Under Review', cls: 'bg-amber-50 text-amber-700 border-amber-200',    step: 1 },
  in_progress:  { label: 'In Progress',  cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', step: 2 },
  escalated:    { label: 'Escalated',    cls: 'bg-orange-50 text-orange-700 border-orange-200', step: 2 },
  resolved:     { label: 'Resolved',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', step: 3 },
  closed:       { label: 'Closed',       cls: 'bg-slate-100 text-slate-600 border-slate-200',   step: 4 },
  dismissed:    { label: 'Dismissed',    cls: 'bg-red-50 text-red-600 border-red-200',          step: 4 },
  // feedback-only statuses
  forwarded:    { label: 'Forwarded',    cls: 'bg-teal-50 text-teal-700 border-teal-200',       step: 1 },
  noted:        { label: 'Noted',        cls: 'bg-slate-100 text-slate-600 border-slate-200',   step: 2 },
}
export const STATUS_KEYS = Object.keys(STATUSES)
export const COMPLAINT_STATUS_KEYS = ['received', 'under_review', 'in_progress', 'escalated', 'resolved', 'closed', 'dismissed']
export const FEEDBACK_STATUS_KEYS = ['received', 'forwarded', 'noted']
export const OPEN_STATUSES = ['received', 'under_review', 'in_progress', 'escalated']

export const PRIORITIES = {
  low:    { label: 'Low',    cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  normal: { label: 'Normal', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  high:   { label: 'High',   cls: 'bg-orange-50 text-orange-600 border-orange-200' },
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-600 border-red-200' },
}

// Open complaints older than this many days are flagged "Overdue" for staff.
export const OVERDUE_DAYS = 7

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export const daysOpen = (c) =>
  Math.floor((Date.now() - new Date(c.submitted_at).getTime()) / 86400000)
export const isOverdue = (c) => c.type !== 'feedback' && OPEN_STATUSES.includes(c.status) && daysOpen(c) > OVERDUE_DAYS


/* ---------- Form validation rules ---------- */
// Student ID: 20XX-XXXXXX or 20XX-XXXXXXX  (year, hyphen, 6 or 7 digits)
export const STUDENT_ID_RE = /^20\d{2}-\d{6,7}$/
export const STUDENT_ID_HINT = '20XX-XXXXXX or 20XX-XXXXXXX (e.g. 2024-123456)'
export const isValidStudentId = (v) => STUDENT_ID_RE.test((v || '').trim())
// Auto-formats as the student types: keeps digits only, inserts the hyphen after the 4th digit.
export const formatStudentId = (v) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 11)
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d
}

// NU email: @students.nu-laguna.edu.ph (students) or @nu-laguna.edu.ph (staff / faculty).
export const NU_EMAIL_DOMAINS = ['students.nu-laguna.edu.ph', 'nu-laguna.edu.ph']
export const NU_EMAIL_DOMAIN = NU_EMAIL_DOMAINS[0] // used for the placeholder
export const NU_EMAIL_HINT = NU_EMAIL_DOMAINS.map((d) => `@${d}`).join(' or ')
export const NU_EMAIL_RE = /^[^@\s]+@(students\.)?nu-laguna\.edu\.ph$/i
export const isValidNuEmail = (v) => NU_EMAIL_RE.test((v || '').trim())
