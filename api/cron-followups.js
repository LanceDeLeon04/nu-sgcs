// GET/POST /api/cron-followups
// Runs once a day via Vercel Cron (see the "crons" entry in vercel.json).
//
//   0. CONCERN ESCALATION (safety net) — a case filed under a concern flagged "Auto-escalate to director"
//      (e.g. "Dean concern") is normally escalated the moment it is submitted (api/escalate-to-director.js).
//      This retries any that were missed (browser closed, email hiccup, re-routed later).
//   1. REMINDERS — for every case forwarded to an office (office_forward_email is set) that hasn't reached a
//      terminal status, if 3 BUSINESS days (Mon-Fri, minus the holidays in gc_holidays) have passed since the
//      office's last activity (or last reminder), email the office again. Repeats until the case is
//      resolved/closed/dismissed (concerns) or noted (feedback). Nothing is sent on weekends or holidays.
//   1b. NO-ACTION ESCALATION — after 2 consecutive reminders with still no action from the office, the case is
//      escalated to the department director ("no action from the office for 1 week"): status -> Escalated,
//      director emailed with the secure link, timeline entry written. Happens once per stretch of inactivity;
//      if the office acts and later goes quiet again, it can escalate again.
//   2. AUTO-CLOSE — any concern that has sat at "resolved" for 3+ days with no follow-up from the complainant
//      is moved to "closed" automatically. (A follow-up flips a resolved concern back to "under_review" via
//      gc_add_followup, so still being "resolved" after 3 days reliably means nobody followed up.)
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
import { getOrigin, fmtShort } from './_lib/digest.js'
import { loadHolidays, isBusinessDay, businessDaysSince, phYmd } from './_lib/businessDays.js'
import { escalateConcernCase } from './_lib/escalation.js'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

const CONCERN_TERMINAL = ['resolved', 'closed', 'dismissed']
const FEEDBACK_TERMINAL = ['noted']

// Tuning knobs
const REMINDER_EVERY_BUSINESS_DAYS = 3   // remind the office after this many business days without action
const ESCALATE_AFTER_REMINDERS = 2       // consecutive reminders (with no action) before the director is told
const ESCALATE_GRACE_BUSINESS_DAYS = 1   // business days to wait after the last reminder before escalating

// Due when 3 business days have passed since the later of: last office activity,
// last reminder already sent. Falls back to office_forwarded_at if the
// office has never posted an update or changed the status.
function isReminderDue(row, holidays, nowMs) {
  const activity = row.office_last_activity_at || row.office_forwarded_at
  if (!activity) return false
  const lastReminder = row.office_last_reminder_at
  const baselineMs = lastReminder && new Date(lastReminder) > new Date(activity)
    ? new Date(lastReminder).getTime()
    : new Date(activity).getTime()
  return businessDaysSince(baselineMs, nowMs, holidays) >= REMINDER_EVERY_BUSINESS_DAYS
}

// 2 consecutive reminders since the office's last action, and still nothing a business day after the 2nd.
function isNoActionEscalationDue(row, holidays, nowMs) {
  const activity = row.office_last_activity_at || row.office_forwarded_at
  if (!activity || !row.office_last_reminder_at) return false
  const activityMs = new Date(activity).getTime()
  const lastReminderMs = new Date(row.office_last_reminder_at).getTime()
  if (lastReminderMs <= activityMs) return false                              // last reminder is older than the last action
  if ((row.office_reminder_count || 0) < ESCALATE_AFTER_REMINDERS) return false
  if (row.no_action_escalated_at && new Date(row.no_action_escalated_at).getTime() > activityMs) return false // already escalated for this silence
  return businessDaysSince(lastReminderMs, nowMs, holidays) >= ESCALATE_GRACE_BUSINESS_DAYS
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

  const origin = getOrigin(req)
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
  let escalatedToDirector = 0
  let closed = 0
  const errors = []

  try {
    const nowMs = Date.now()
    const holidays = await loadHolidays(supabase)
    const businessToday = isBusinessDay(phYmd(nowMs), holidays)

    // ---------------------------------------------------------
    // 0. Safety net: cases under an "auto-escalate" concern that were never escalated
    // ---------------------------------------------------------
    const { data: flagged, error: flagErr } = await supabase.from('gc_concerns').select('id').eq('escalate_to_director', true)
    if (flagErr) throw flagErr
    if ((flagged || []).length) {
      const { data: missed, error: missedErr } = await supabase
        .from('gc_complaints')
        .select('id, reference_no, type, status')
        .in('concern_id', flagged.map((c) => c.id))
        .is('director_escalated_at', null)
      if (missedErr) throw missedErr
      for (const row of missed || []) {
        if ((row.type === 'feedback' ? FEEDBACK_TERMINAL : CONCERN_TERMINAL).includes(row.status)) continue
        try {
          const out = await escalateConcernCase({ supabase, origin, ref: row.reference_no, sendEmail })
          if (out.emailed) escalatedToDirector++
        } catch (e) { errors.push(`concern escalation ${row.reference_no}: ${e.message}`) }
      }
    }

    // ---------------------------------------------------------
    // 1. Reminders (+ no-action escalation) — business days only, never on a weekend or holiday
    // ---------------------------------------------------------
    const terminalAll = [...new Set([...CONCERN_TERMINAL, ...FEEDBACK_TERMINAL])]
    const { data: open, error: openErr } = businessToday ? await supabase
      .from('gc_complaints')
      .select(`
        id, type, reference_no, status, department_id,
        office_forward_email, office_access_code, office_forwarded_at,
        office_last_activity_at, office_last_reminder_at, office_reminder_count,
        director_escalated_at, director_escalation_reason, no_action_escalated_at,
        office_department, office_unit, office_concern, subject
      `)
      .not('office_forward_email', 'is', null)
      .not('status', 'in', `(${terminalAll.join(',')})`) : { data: [], error: null }

    if (openErr) throw openErr

    const { data: deptRows, error: deptErr } = await supabase.from('gc_departments').select('id, name, director_email')
    if (deptErr) throw deptErr
    const deptById = Object.fromEntries((deptRows || []).map((d) => [d.id, d]))

    for (const row of open || []) {
      const terminal = row.type === 'feedback' ? FEEDBACK_TERMINAL : CONCERN_TERMINAL
      if (terminal.includes(row.status)) continue

      // 1b. Two reminders ignored -> tell the director (skip if the director IS the office, e.g. a Dean concern)
      const dept = deptById[row.department_id]
      if (dept?.director_email && dept.director_email.toLowerCase() !== (row.office_forward_email || '').toLowerCase()
          && isNoActionEscalationDue(row, holidays, nowMs)) {
        const activity = row.office_last_activity_at || row.office_forwarded_at
        await sendEmail({
          type: 'director_escalation',
          reason: 'no_action',
          to: dept.director_email,
          referenceNo: row.reference_no,
          subject: row.subject,
          department: row.office_department, unit: row.office_unit, concern: row.office_concern,
          itemType: row.type,
          reminderCount: row.office_reminder_count,
          forwardedOn: fmtShort(new Date(row.office_forwarded_at).getTime(), true),
          lastActionOn: row.office_last_activity_at ? fmtShort(new Date(row.office_last_activity_at).getTime(), true) : null,
          lastReminderOn: fmtShort(new Date(row.office_last_reminder_at).getTime(), true),
          code: row.office_access_code,
          officeUrl: `${origin}/office/${row.reference_no}`,
        })

        const patch = { no_action_escalated_at: new Date().toISOString() }
        if (!row.director_escalated_at) { patch.director_escalated_at = patch.no_action_escalated_at; patch.director_escalation_reason = 'no_action' }
        if (row.type === 'complaint' && ['received', 'under_review', 'in_progress'].includes(row.status)) patch.status = 'escalated'
        const { error: escErr } = await supabase.from('gc_complaints').update(patch).eq('id', row.id)
        if (escErr) { errors.push(`no-action escalation ${row.reference_no}: ${escErr.message}`); continue }

        const { error: escNoteErr } = await supabase.from('gc_updates').insert({
          complaint_id: row.id, author_type: 'system', author_name: 'System',
          kind: 'director_escalation',
          message: `Escalated to the ${dept.name} director (${dept.director_email}): no action from the office for 1 week, even after ${row.office_reminder_count} reminders.`,
          is_public: false,
        })
        if (escNoteErr) errors.push(`no-action escalation note ${row.reference_no}: ${escNoteErr.message}`)
        escalatedToDirector++
        continue
      }

      if (!isReminderDue(row, holidays, nowMs)) continue

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
        willEscalate: nextCount >= ESCALATE_AFTER_REMINDERS,
      })

      const { error: updErr } = await supabase
        .from('gc_complaints')
        .update({ office_last_reminder_at: new Date().toISOString(), office_reminder_count: nextCount })
        .eq('id', row.id)
      if (updErr) { errors.push(`reminder update ${row.reference_no}: ${updErr.message}`); continue }

      const { error: noteErr } = await supabase.from('gc_updates').insert({
        complaint_id: row.id, author_type: 'system', author_name: 'System',
        kind: 'office_reminder',
        message: `Reminder #${nextCount} sent to ${row.office_forward_email} — no office action in ${REMINDER_EVERY_BUSINESS_DAYS}+ business days.`,
        is_public: false,
      })
      if (noteErr) errors.push(`reminder note ${row.reference_no}: ${noteErr.message}`)

      reminded++
    }

    // ---------------------------------------------------------
    // 2. Auto-close concerns resolved 3+ days ago with no follow-up
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
    return res.status(500).json({ error: err.message, reminded, escalatedToDirector, closed, errors })
  }

  return res.status(200).json({ ok: true, reminded, escalatedToDirector, closed, errors })
}
