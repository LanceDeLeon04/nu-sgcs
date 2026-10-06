// Signed, stateless links to the weekly director report (/report/:token).
// Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256). No DB table needed.
// Payload: { d: department_id, t: end of period (ms), s: start of period (ms), m: 1 if manually sent, e: expiry (ms) }
// Secret: REPORT_LINK_SECRET, falling back to CRON_SECRET, then SUPABASE_SERVICE_ROLE_KEY.
import crypto from 'node:crypto'

const secret = () => process.env.REPORT_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const b64 = (buf) => Buffer.from(buf).toString('base64url')
const sign = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url')

export const REPORT_TTL_MS = 60 * 24 * 60 * 60 * 1000 // links stay valid for 60 days

export function makeReportToken(departmentId, endMs, { fromMs, manual } = {}) {
  // Expiry counts from when the link is issued, so reports for past ranges still work.
  const body = b64(JSON.stringify({ d: departmentId, t: endMs, ...(fromMs ? { s: fromMs } : {}), ...(manual ? { m: 1 } : {}), e: Date.now() + REPORT_TTL_MS }))
  return `${body}.${sign(body)}`
}

export function readReportToken(token) {
  if (!secret() || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const good = Buffer.from(sign(body)); const given = Buffer.from(sig)
  if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!p.d || !p.t || Date.now() > p.e) return null
    return p
  } catch { return null }
}
