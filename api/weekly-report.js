// GET /api/weekly-report?token=...
// Returns the aggregated data behind a department's weekly report page (/report/:token).
// Privacy: no reporter identity, no descriptions; confidential cases are counted in the
// charts but listed without subject/office.
import { createClient } from '@supabase/supabase-js'
import { readReportToken } from './_lib/reportToken.js'

const DAY_MS = 24 * 60 * 60 * 1000
const PH_OFFSET_MS = 8 * 60 * 60 * 1000
const MIN_WEEKS = 8
const MAX_WEEKS = 26
const OPEN = ['received', 'under_review', 'in_progress', 'escalated']
const phDay = (ms) => new Date(ms + PH_OFFSET_MS).toISOString().slice(0, 10)
const fmtShort = (ms, withYear = false) => new Date(ms + PH_OFFSET_MS).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const tok = readReportToken(req.query?.token)
  if (!tok) return res.status(401).json({ error: 'This report link is invalid or has expired.' })

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'Server is not configured.' })
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const end = tok.t
  const start = tok.s && tok.s < end ? tok.s : end - 7 * DAY_MS
  const rangeDays = Math.max(1, Math.round((end - start) / DAY_MS))
  const WEEKS = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.ceil(rangeDays / 7)))
  const trendStart = end - WEEKS * 7 * DAY_MS
  try {
    const [{ data: dept, error: dErr }, { data: rows, error: rErr }, { data: older, error: oErr }] = await Promise.all([
      supabase.from('gc_departments').select('id, name').eq('id', tok.d).maybeSingle(),
      supabase.from('gc_complaints')
        .select('type, reference_no, status, priority, subject, is_confidential, office_unit, office_concern, submitted_at, resolved_at')
        .eq('department_id', tok.d).gte('submitted_at', new Date(trendStart).toISOString()).lte('submitted_at', new Date(end).toISOString())
        .order('submitted_at', { ascending: false }).limit(5000),
      supabase.from('gc_complaints').select('submitted_at').eq('department_id', tok.d).neq('type', 'feedback')
        .lt('submitted_at', new Date(start).toISOString()).in('status', OPEN),
    ])
    if (dErr || rErr || oErr) throw (dErr || rErr || oErr)
    if (!dept) return res.status(404).json({ error: 'Department not found.' })

    const all = rows || []
    const week = all.filter((r) => new Date(r.submitted_at).getTime() >= start)

    // 8-week trend (oldest -> newest), weeks end on the digest day
    const trend = Array.from({ length: WEEKS }, (_, i) => {
      const wEnd = end - (WEEKS - 1 - i) * 7 * DAY_MS
      return { label: fmtShort(wEnd), from: wEnd - 7 * DAY_MS, to: wEnd, complaints: 0, feedback: 0 }
    })
    for (const r of all) {
      const t = new Date(r.submitted_at).getTime()
      const b = trend.find((w) => t > w.from && t <= w.to)
      if (b) b[r.type === 'feedback' ? 'feedback' : 'complaints']++
    }

    const tally = (list, f) => { const m = {}; for (const r of list) { const k = f(r); if (k) m[k] = (m[k] || 0) + 1 } return m }
    const status = Object.entries(tally(week, (r) => r.status)).map(([k, v]) => ({ key: k, value: v }))
    const priority = Object.entries(tally(week.filter((r) => r.type !== 'feedback' && OPEN.includes(r.status)), (r) => r.priority))
      .map(([k, v]) => ({ key: k, value: v }))
    const units = Object.entries(tally(week.filter((r) => !r.is_confidential), (r) => r.office_unit))
      .map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8)

    const complaints = week.filter((r) => r.type !== 'feedback')
    const resolved = complaints.filter((r) => ['resolved', 'closed'].includes(r.status)).length
    const olderOpenAges = (older || []).map((r) => Math.floor((end - new Date(r.submitted_at).getTime()) / DAY_MS))

    return res.status(200).json({
      department: dept.name,
      periodLabel: `${fmtShort(start, !!tok.m)} \u2013 ${fmtShort(end, !!tok.m)}`,
      rangeDays,
      generatedFor: phDay(end),
      totals: {
        total: week.length, complaints: complaints.length, feedback: week.length - complaints.length,
        confidential: week.filter((r) => r.is_confidential).length,
        stillOpen: complaints.filter((r) => OPEN.includes(r.status)).length,
        resolved, olderOpen: olderOpenAges.length,
        oldestOpenDays: olderOpenAges.length ? Math.max(...olderOpenAges) : 0,
      },
      trend: trend.map(({ label, complaints, feedback }) => ({ label, complaints, feedback })),
      status, priority, units,
      items: week.slice(0, 50).map((r) => ({
        referenceNo: r.reference_no, type: r.type, status: r.status,
        subject: r.is_confidential ? 'Confidential \u2014 details restricted' : r.subject,
        office: r.is_confidential ? '' : [r.office_unit, r.office_concern].filter(Boolean).join(' \u203a '),
        submittedAt: r.submitted_at,
      })),
      moreCount: Math.max(0, week.length - 50),
    })
  } catch (err) {
    console.error('weekly-report error', err)
    return res.status(500).json({ error: 'Could not load the report.' })
  }
}
