// Shared by the Friday cron (api/cron-weekly-digest.js) and the admin manual send
// (api/send-weekly-report.js). Sends ONE summary email per department director for the
// given time range. Reporter identity is never included; confidential cases have no details.
import { makeReportToken } from './reportToken.js'

const PH_OFFSET_MS = 8 * 60 * 60 * 1000
const MAX_LISTED = 40
export const STATUS_LABELS = {
  received: 'Received', under_review: 'Under review', in_progress: 'In progress', escalated: 'Escalated',
  resolved: 'Resolved', closed: 'Closed', dismissed: 'Dismissed', forwarded: 'Forwarded', noted: 'Noted',
}
const OPEN = ['received', 'under_review', 'in_progress', 'escalated']

export const phDate = (ms) => new Date(ms + PH_OFFSET_MS).toISOString().slice(0, 10)
export const fmtShort = (ms, withYear = false) =>
  new Date(ms + PH_OFFSET_MS).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })

export function getOrigin(req) {
  // 1) explicit public URL  2) the host the request actually came in on (the site the admin is using,
  // same as the office/tracking emails, which use the browser's own origin)  3) Vercel's production alias.
  // VERCEL_URL (the per-deployment address) is last: it sits behind Vercel's login wall, which is why
  // report links used to bounce to Vercel.
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/+$/, '')
  const host = (req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim()
  if (host) return `https://${host}`
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''
}

// opts: { supabase, origin, fromMs, toMs, periodLabel, departmentIds?, dry?, manual?, weekStart? }
//  - weekStart set  => idempotent: skips departments already in gc_digest_log for that week and logs each send (Friday cron).
//  - manual true    => never reads/writes gc_digest_log, so it can be sent any time and never blocks the Friday cron.
export async function sendDirectorDigests(opts) {
  const { supabase, origin, fromMs, toMs, periodLabel, departmentIds, dry = false, manual = false, weekStart } = opts
  const sinceIso = new Date(fromMs).toISOString()
  const untilIso = new Date(toMs).toISOString()
  const sent = []; const skipped = []; const errors = []

  const [{ data: depts, error: dErr }, { data: fresh, error: fErr }, { data: older, error: oErr }, logRes] = await Promise.all([
    supabase.from('gc_departments').select('id, name, director_email'),
    supabase.from('gc_complaints')
      .select('id, type, reference_no, status, subject, is_confidential, department_id, office_unit, office_concern, submitted_at')
      .gte('submitted_at', sinceIso).lte('submitted_at', untilIso).not('department_id', 'is', null).order('submitted_at', { ascending: true }).limit(5000),
    supabase.from('gc_complaints')
      .select('department_id').lt('submitted_at', sinceIso).neq('type', 'feedback').in('status', OPEN).not('department_id', 'is', null).limit(5000),
    weekStart ? supabase.from('gc_digest_log').select('department_id').eq('week_start', weekStart) : Promise.resolve({ data: [], error: null }),
  ])
  const lErr = logRes.error
  if (dErr || fErr || oErr || lErr) throw (dErr || fErr || oErr || lErr)

  const alreadySent = new Set((logRes.data || []).map((r) => r.department_id))
  const olderBy = {}; for (const r of older || []) olderBy[r.department_id] = (olderBy[r.department_id] || 0) + 1
  const freshBy = {}; for (const r of fresh || []) (freshBy[r.department_id] ||= []).push(r)
  const only = Array.isArray(departmentIds) && departmentIds.length ? new Set(departmentIds) : null

  for (const d of depts || []) {
    if (only && !only.has(d.id)) continue
    const rows = freshBy[d.id] || []
    if (!rows.length) { skipped.push(`${d.name}: no concerns in this period`); continue }
    if (!d.director_email) { skipped.push(`${d.name}: NO DIRECTOR EMAIL`); continue }
    if (weekStart && alreadySent.has(d.id)) { skipped.push(`${d.name}: already sent for ${weekStart}`); continue }

    const counts = {}; for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1
    const statusCounts = Object.entries(counts).map(([k, v]) => ({ label: STATUS_LABELS[k] || k, count: v }))
    const items = rows.slice(0, MAX_LISTED).map((r) => ({
      referenceNo: r.reference_no,
      typeLabel: r.type === 'feedback' ? 'Feedback' : 'Complaint',
      statusLabel: STATUS_LABELS[r.status] || r.status,
      subject: r.is_confidential ? 'Confidential \u2014 details restricted' : r.subject,
      office: r.is_confidential ? '' : [r.office_unit, r.office_concern].filter(Boolean).join(' \u203a '),
    }))
    const reportUrl = `${origin}/report/${makeReportToken(d.id, toMs, { fromMs, manual })}`
    const payload = {
      type: 'director_digest', to: d.director_email, departmentName: d.name, periodLabel, total: rows.length,
      reportUrl, statusCounts, items, moreCount: Math.max(0, rows.length - MAX_LISTED), olderOpen: olderBy[d.id] || 0,
    }
    if (dry) { sent.push({ department: d.name, to: d.director_email, total: rows.length, dry: true, reportUrl }); continue }

    try {
      const r = await fetch(`${origin}/api/send-email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) { errors.push(`${d.name}: send failed (${r.status})`); continue }
      if (weekStart) {
        const { error: logErr } = await supabase.from('gc_digest_log').insert({ department_id: d.id, week_start: weekStart, sent_to: d.director_email, item_count: rows.length })
        if (logErr) errors.push(`${d.name}: sent but not logged: ${logErr.message}`)
      }
      sent.push({ department: d.name, to: d.director_email, total: rows.length })
    } catch (e) { errors.push(`${d.name}: ${e.message}`) }
  }
  return { sent, skipped, errors }
}
