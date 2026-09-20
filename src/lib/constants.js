export const APP_NAME = 'Council of Leaders'
export const APP_SUBTITLE = 'Student Grievance and Complaints System'

// Complaint categories: 4 primary groups, each with sub-categories.
// Must match gc_submit_complaint() in migration_categories_validation.sql
export const CATEGORY_GROUPS = [
  {
    name: 'Academic Concerns',
    description: 'Issues related to coursework, exams, grading, or any academic-related matters.',
    subs: ['Academic Concern', 'Instructor / Faculty Conduct'],
  },
  {
    name: 'Student Welfare',
    description: "Matters regarding students' well-being, safety, and support services.",
    subs: ['Harassment or Bullying', 'Discrimination', 'Safety & Security'],
  },
  {
    name: 'Administrative Issues',
    description: "Concerns related to the institution's management, policies, or processes.",
    subs: ['Facilities & Services', 'Fees & Financial Concern', 'Office / Administrative Service'],
  },
  {
    name: 'Others',
    description: 'Issues outside academic/admin concerns.',
    subs: ['Student Council / Officer Conduct', 'Student Organization Concern', 'Other'],
  },
]
export const CATEGORIES = CATEGORY_GROUPS.map((g) => g.name)
export const subcategoriesOf = (primary) => CATEGORY_GROUPS.find((g) => g.name === primary)?.subs || []
export const groupOf = (primary) => CATEGORY_GROUPS.find((g) => g.name === primary) || null
// "Student Welfare › Discrimination" (feedback rows have no sub-category)
export const categoryLabel = (c) => (c?.subcategory ? `${c.category} › ${c.subcategory}` : c?.category || '')

// Categories for FEEDBACK (must match gc_submit_feedback() in schema.sql)
export const FEEDBACK_CATEGORIES = [
  'Suggestion',
  'Compliment / Commendation',
  'Concern / Observation',
  'Academic',
  'Student Council / Organization',
  'Facilities & Services',
  'Office / Administrative Service',
  'Events & Activities',
  'Other',
]

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
