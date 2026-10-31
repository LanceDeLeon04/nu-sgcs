// POST /api/escalate-to-director   { ref }
// Called by the submit form right after a student files a case under a concern that is flagged
// "Auto-escalate to director" (e.g. "Dean concern"). Runs server-side with the service-role key so no
// case details ever go back to the browser: it only answers { escalated: true|false }.
//
// Safe to call by anyone: it does nothing unless the case really is under a flagged concern, it only
// acts once per case, and it can only ever email that department's own director.

import { createClient } from '@supabase/supabase-js'
import { getOrigin } from './_lib/digest.js'
import { escalateConcernCase } from './_lib/escalation.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const ref = String(body?.ref || '').trim()
  if (!ref || ref.length > 60) return res.status(400).json({ error: 'A case reference is required.' })

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'Server is not configured for escalations.' })
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const origin = getOrigin(req)
  const sendEmail = async (payload) => {
    const r = await fetch(`${origin}/api/send-email`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (!r.ok) console.warn('escalate-to-director: send-email failed', r.status, await r.text().catch(() => ''))
  }

  try {
    const out = await escalateConcernCase({ supabase, origin, ref, sendEmail })
    return res.status(200).json({ escalated: !!out.escalated })
  } catch (err) {
    console.error('escalate-to-director error', err)
    return res.status(500).json({ error: 'Could not escalate this case.' })
  }
}
