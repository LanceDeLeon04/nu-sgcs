// GET/POST /api/cron-weekly-digest
// Runs every Friday via Vercel Cron (see "crons" in vercel.json) -- unchanged schedule.
//
// For each department that received concerns in the last 7 days, sends ONE summary email to
// that department's director (gc_departments.director_email), including a signed link to the
// full weekly report with charts (/report/:token). Individual concerns are NEVER forwarded
// to the director.
//
// Idempotent: gc_digest_log (department_id, week_start) stops a retried or double-fired cron
// from emailing the same director twice. Admins can ALSO send any date range on demand from
// the staff app (api/send-weekly-report.js); those manual sends are not logged here, so they
// never block this Friday send.
//
// Vercel Cron schedules are in UTC. "0 9 * * 5" = Friday 09:00 UTC = Friday 5:00 PM in the
// Philippines (UTC+8). Manual test: add ?dry=1 (with the CRON_SECRET bearer header if set).

import { createClient } from '@supabase/supabase-js'
import { sendDirectorDigests, getOrigin, phDate, fmtShort } from './_lib/digest.js'

const DAY_MS = 24 * 60 * 60 * 1000

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'Server is not configured for scheduled jobs.' })
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const now = Date.now()
  const weekStart = phDate(now) // the Friday this digest covers (PH date)
  try {
    const out = await sendDirectorDigests({
      supabase, origin: getOrigin(req), fromMs: now - 7 * DAY_MS, toMs: now,
      periodLabel: `${fmtShort(now - 7 * DAY_MS)} \u2013 ${fmtShort(now)}`,
      dry: req.query?.dry === '1', weekStart,
    })
    return res.status(200).json({ ok: true, weekStart, ...out })
  } catch (err) {
    console.error('cron-weekly-digest error', err)
    return res.status(500).json({ error: err.message })
  }
}
