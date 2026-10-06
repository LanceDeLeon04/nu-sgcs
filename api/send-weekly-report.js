// POST /api/send-weekly-report   (admins only)
// Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', departmentIds?: string[], dry?: boolean }  (dates are PH dates, inclusive)
// Header: Authorization: Bearer <the signed-in staff member's Supabase access token>
//
// Sends the same director summary as the Friday cron, for ANY date range, at any time.
// Not logged in gc_digest_log, so the automatic Friday send is unaffected.
// dry:true sends nothing and returns who would be emailed plus a preview link to each report.
import { createClient } from '@supabase/supabase-js'
import { sendDirectorDigests, getOrigin } from './_lib/digest.js'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 366
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const label = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }) }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'Server is not configured.' })
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // Authenticate the caller and require an active admin.
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return res.status(401).json({ error: 'Please sign in again.' })
  const { data: userData, error: uErr } = await supabase.auth.getUser(jwt)
  if (uErr || !userData?.user) return res.status(401).json({ error: 'Please sign in again.' })
  const { data: staff } = await supabase.from('gc_staff').select('role, is_active').eq('user_id', userData.user.id).maybeSingle()
  if (!staff?.is_active || staff.role !== 'admin') return res.status(403).json({ error: 'Only admins can send weekly reports.' })

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body) } catch { return {} } })() : (req.body || {})
  const { from, to, departmentIds, dry } = body
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) return res.status(400).json({ error: 'Choose a valid start and end date.' })
  const fromMs = Date.parse(`${from}T00:00:00+08:00`)
  const endOfDay = Date.parse(`${to}T23:59:59.999+08:00`)
  if (Number.isNaN(fromMs) || Number.isNaN(endOfDay)) return res.status(400).json({ error: 'Choose a valid start and end date.' })
  if (fromMs > endOfDay) return res.status(400).json({ error: 'The start date must be on or before the end date.' })
  if (fromMs > Date.now()) return res.status(400).json({ error: 'The start date is in the future.' })
  if ((endOfDay - fromMs) / DAY_MS > MAX_RANGE_DAYS) return res.status(400).json({ error: `Please choose a range of ${MAX_RANGE_DAYS} days or fewer.` })
  const toMs = Math.min(endOfDay, Date.now())

  try {
    const out = await sendDirectorDigests({
      supabase, origin: getOrigin(req), fromMs, toMs, manual: true, dry: !!dry,
      periodLabel: from === to ? label(from) : `${label(from)} \u2013 ${label(to)}`,
      departmentIds: Array.isArray(departmentIds) ? departmentIds.filter((x) => typeof x === 'string') : undefined,
    })
    return res.status(200).json({ ok: true, dry: !!dry, from, to, ...out })
  } catch (err) {
    console.error('send-weekly-report error', err)
    return res.status(500).json({ error: err.message || 'Could not send the report.' })
  }
}
