// POST /api/send-email
// Sends a transactional email to a student via Brevo's HTTP API.
// Runs server-side on Vercel, so the Brevo API key is never exposed to the
// browser and nothing about it touches the campus network / IT filters.
//
// Required env vars (set in Vercel Project Settings > Environment Variables,
// NOT prefixed with VITE_ so they stay server-only):
//   BREVO_API_KEY      - from Brevo dashboard > SMTP & API > API Keys
//   BREVO_SENDER_EMAIL - the "From" address (must be a Verified Sender in Brevo)
//   BREVO_SENDER_NAME  - optional, defaults to "Council of Leaders"

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

// NU Blue / NU Gold, matching tailwind.config.js
const NUBLUE = '#0033A0'
const NUBLUE_DARK = '#00287d'
const NUGOLD = '#FFC72C'

// Mirrors src/lib/constants.js STATUSES colors (tailwind -> hex), for the email pill.
const STATUS_COLORS = {
  received:     { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
  under_review: { bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
  in_progress:  { bg: '#eef2ff', fg: '#4338ca', border: '#c7d2fe' },
  escalated:    { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' },
  resolved:     { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  closed:       { bg: '#f1f5f9', fg: '#475569', border: '#e2e8f0' },
  dismissed:    { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca' },
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

function nl2br(s = '') {
  return escapeHtml(s).replace(/\n/g, '<br/>')
}

// Shared, table-based HTML shell (works across Gmail/Outlook/etc.) with the
// NU Blue header, logo, a white content card, and a footer with the
// tracking code + CTA link.
function wrap({ logoUrl, eyebrow, heading, bodyHtml, code, trackUrl }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Segoe UI,Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,40,125,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, ${NUBLUE} 0%, ${NUBLUE_DARK} 100%);padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" style="width:48px;">
                    ${logoUrl ? `<img src="${logoUrl}" width="40" height="40" alt="" style="display:block;border-radius:8px;background:#fff;padding:4px;" />` : ''}
                  </td>
                  <td valign="middle" style="padding-left:12px;">
                    <p style="margin:0;color:${NUGOLD};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
                    <p style="margin:2px 0 0;color:#ffffff;font-size:17px;font-weight:800;">Council of Leaders</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;color:#0f172a;font-size:19px;font-weight:800;">${escapeHtml(heading)}</h1>
              <div style="color:#334155;font-size:14px;line-height:1.65;">${bodyHtml}</div>
            </td>
          </tr>

          <!-- Tracking code -->
          ${code ? `
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4ff;border:1px solid #d9e6ff;border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;color:${NUBLUE};font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Tracking Code</p>
                    <p style="margin:0;color:${NUBLUE_DARK};font-size:20px;font-weight:800;font-family:Consolas,Menlo,monospace;letter-spacing:.03em;">${escapeHtml(code)}</p>
                    ${trackUrl ? `
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
                      <tr><td style="background:${NUBLUE};border-radius:8px;">
                        <a href="${escapeHtml(trackUrl)}" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">Track this complaint &rarr;</a>
                      </td></tr>
                    </table>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #eef2f7;">
              <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
                This is an automated message from the Council of Leaders Student Grievance System. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

// Builds the subject + HTML body for each notification type.
// `p` is the payload sent from the client (see src/lib/email.js).
function buildMessage(type, p, logoUrl) {
  const name = escapeHtml(p.name || 'Student')
  const code = p.trackingCode || ''
  const trackUrl = p.trackUrl || null

  if (type === 'confirmation') {
    return {
      subject: `We received your complaint (${code})`,
      html: wrap({
        logoUrl, eyebrow: 'Complaint received', heading: 'Your complaint has been received',
        code, trackUrl,
        bodyHtml: `
          <p style="margin:0 0 12px;">Hi ${name},</p>
          <p style="margin:0 0 12px;">Your formal complaint has been received and logged with the Council of Leaders. It is now in the queue for review.</p>
          <p style="margin:0;">A representative may reach out to you via <b>Microsoft Teams</b> to confirm the details of your report. Keep your tracking code below to follow every update.</p>`,
      }),
    }
  }

  if (type === 'status') {
    const colors = STATUS_COLORS[p.statusKey] || { bg: '#f1f5f9', fg: '#334155', border: '#e2e8f0' }
    const statusLabel = escapeHtml(p.statusLabel || 'Updated')
    const summary = p.summary ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr><td style="background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 4px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Outcome / Notes</p>
              <p style="margin:0;color:#334155;font-size:13.5px;">${nl2br(p.summary)}</p>
            </td></tr>
          </table>` : ''
    return {
      subject: `Your complaint status changed to "${p.statusLabel}" (${code})`,
      html: wrap({
        logoUrl, eyebrow: 'Status update', heading: 'Your complaint status has been updated',
        code, trackUrl,
        bodyHtml: `
          <p style="margin:0 0 14px;">Hi ${name},</p>
          <p style="margin:0 0 6px;">The status of your complaint is now:</p>
          <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};font-size:13px;font-weight:700;">${statusLabel}</span>
          ${summary}`,
      }),
    }
  }

  if (type === 'reply') {
    return {
      subject: `A representative replied to your complaint (${code})`,
      html: wrap({
        logoUrl, eyebrow: 'New reply', heading: 'A representative replied to your complaint',
        code, trackUrl,
        bodyHtml: `
          <p style="margin:0 0 14px;">Hi ${name},</p>
          <p style="margin:0 0 10px;">A representative has posted a reply on your complaint:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="border-left:3px solid ${NUGOLD};background:#f8fafc;border-radius:0 10px 10px 0;padding:14px 16px;">
              <p style="margin:0;color:#334155;font-size:13.5px;">${nl2br(p.message)}</p>
            </td></tr>
          </table>`,
      }),
    }
  }

  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.BREVO_API_KEY
  const senderEmail = process.env.BREVO_SENDER_EMAIL
  if (!apiKey || !senderEmail) {
    console.error('send-email: missing BREVO_API_KEY or BREVO_SENDER_EMAIL')
    return res.status(500).json({ error: 'Email is not configured on the server.' })
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  const { type, to } = body || {}

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return res.status(400).json({ error: 'A valid recipient email is required.' })
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host
  const logoUrl = host ? `https://${host}/COLLogo.png` : null

  const msg = buildMessage(type, body, logoUrl)
  if (!msg) return res.status(400).json({ error: 'Unknown email type.' })

  try {
    const r = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || 'Council of Leaders' },
        to: [{ email: to, name: body.name || undefined }],
        subject: msg.subject,
        htmlContent: msg.html,
      }),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      console.error('Brevo error', r.status, detail)
      return res.status(502).json({ error: 'Failed to send email.' })
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('send-email exception', err)
    return res.status(500).json({ error: 'Failed to send email.' })
  }
}
