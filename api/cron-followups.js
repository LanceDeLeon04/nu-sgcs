// GET/POST /api/cron-followups
// Runs once a day via Vercel Cron (see the "crons" entry in vercel.json).
//
//   1. REMINDERS — for every case forwarded to an office (office_forward_email
//      is set) that hasn't reached a terminal status, if 3+ days have passed
//      since the office's last activity (or last reminder), email the office
//      again. This repeats every 3 days until the case is resolved/closed/
//      dismissed (complaints) or noted (feedback).
//   2. AUTO-CLOSE — any complaint that has sat at "resolved" for 3+ days with
//      no follow-up from the complainant is moved to "closed" automatically.
//      (A follow-up flips a resolved complaint back to "under_review" via
//      gc_add_followup, so still being "resolved" after 3 days reliably means
//      nobody followed up.)
//
// Auth: when the CRON_SECRET env var is set, Vercel Cron automatically sends
// `Authorization: Bearer <CRON_SECRET>` on the request it triggers, and this
// handler rejects any request that doesn't match. Set CRON_SECRET in Vercel
// Project Settings > Environment Variables to enable this (recommended).
//
// Needs, in addition to the existing BREVO_* vars used by /api/send-email:
//   VITE_SUPABASE_URL          - already set for the app
//   SUPABASE_SERVICE_ROLE_KEY  - server-only, bypasses RLS (see .env.example)

import { createClient } from '@supabase/supabase-js'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

const COMPLAINT_TERMINAL = ['resolved', 'closed', 'dismissed']
const FEEDBACK_TERMINAL = ['noted']

// Due when 3+ days have passed since the later of: last office activity,
// last reminder already sent. Falls back to office_forwarded_at if the
// office has never posted an update or changed the status.
function isReminderDue(row) {
  const activity = row.office_last_activity_at || row.office_forwarded_at
  if (!activity) return false
  const lastReminder = row.office_last_reminder_at
  const baselineMs = lastReminder && new Date(lastReminder) > new Date(activity)
    ? new Date(lastReminder).getTime()
    : new Date(activity).getTime()
  return Date.now() - baselineMs >= THREE_DAYS_MS
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('cron-followups: missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return res.status(500).json({ error: 'Server is not configured for scheduled jobs.' })
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${req.headers.host}`
  const sendEmail = async (payload) => {
    try {
      const r = await fetch(`${origin}/api/send-email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) console.warn('cron-followups: send-email failed', payload.type, r.status, await r.text().catch(() => ''))
    } catch (err) {
      console.warn('cron-followups: send-email error', err.message)
    }
  }

  let reminded = 0
  let closed = 0
  const errors = []

  try {
    // ---------------------------------------------------------
    // 1. Reminders for offices sitting on a forwarded case
    // ---------------------------------------------------------
    const nonTerminal = [...new Set([...COMPLAINT_TERMINAL, ...FEEDBACK_TERMINAL])]
    const { data: open, error: openErr } = await supabase
      .from('gc_complaints')
      .select(`
        id, type, reference_no, status,
        office_forward_email, office_access_code, office_forwarded_at,
        office_last_activity_at, office_last_reminder_at, office_reminder_count,
        office_department, office_unit, office_concern, subject
      `)
      .not('office_forward_email', 'is', null)
      .not('status', 'in', `(${nonTerminal.join(',')})`)

    if (openErr) throw openErr

    for (const row of open || []) {
      const terminal = row.type === 'feedback' ? FEEDBACK_TERMINAL : COMPLAINT_TERMINAL
      if (terminal.includes(row.status)) continue
      if (!isReminderDue(row)) continue

      const nextCount = (row.office_reminder_count || 0) + 1

      await sendEmail({
        type: 'office_reminder',
        to: row.office_forward_email,
        referenceNo: row.reference_no,
        unitName: [row.office_department, row.office_unit, row.office_concern].filter(Boolean).join(' \u203a ') || 'your office',
        subject: row.subject,
        code: row.office_access_code,
        officeUrl: `${origin}/office/${row.reference_no}`,
        reminderCount: nextCount,
      })

      const { error: updErr } = await supabase
        .from('gc_complaints')
        .update({ office_last_reminder_at: new Date().toISOString(), office_reminder_count: nextCount })
        .eq('id', row.id)
      if (updErr) { errors.push(`reminder update ${row.reference_no}: ${updErr.message}`); continue }

      const { error: noteErr } = await supabase.from('gc_updates').insert({
        complaint_id: row.id, author_type: 'system', author_name: 'System',
        kind: 'office_reminder',
        message: `Reminder #${nextCount} sent to ${row.office_forward_email} — no office update in 3+ days.`,
        is_public: false,
      })
      if (noteErr) errors.push(`reminder note ${row.reference_no}: ${noteErr.message}`)

      reminded++
    }

    // ---------------------------------------------------------
    // 2. Auto-close complaints resolved 3+ days ago with no follow-up
    // ---------------------------------------------------------
    const cutoffIso = new Date(Date.now() - THREE_DAYS_MS).toISOString()
    const { data: stale, error: staleErr } = await supabase
      .from('gc_complaints')
      .select('id, reference_no, tracking_code, complainant_name, email, resolved_at')
      .eq('status', 'resolved')
      .lt('resolved_at', cutoffIso)

    if (staleErr) throw staleErr

    for (const row of stale || []) {
      // The before/after-update triggers on gc_complaints handle closed_at,
      // updated_at, and the public status_change timeline entry automatically.
      const { error: updErr } = await supabase.from('gc_complaints').update({ status: 'closed' }).eq('id', row.id)
      if (updErr) { errors.push(`auto-close ${row.reference_no}: ${updErr.message}`); continue }
      closed++

      if (row.email) {
        await sendEmail({
          type: 'status', to: row.email, name: row.complainant_name,
          trackingCode: row.tracking_code, trackUrl: `${origin}/track/${row.tracking_code}`,
          statusKey: 'closed', statusLabel: 'Closed',
          summary: 'Automatically closed after 3 days with no follow-up since it was marked resolved.',
        })
      }
    }
  } catch (err) {
    console.error('cron-followups error', err)
    return res.status(500).json({ error: err.message, reminded, closed, errors })
  }

  return res.status(200).json({ ok: true, reminded, closed, errors })
}
