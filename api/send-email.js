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

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

// Builds the subject + HTML body for each notification type.
// `p` is the payload sent from the client (see src/lib/email.js).
function buildMessage(type, p) {
  const name = escapeHtml(p.name || 'Student')
  const code = escapeHtml(p.trackingCode || '')
  const trackUrl = p.trackUrl ? escapeHtml(p.trackUrl) : null

  const footer = `
    <p style="font-size:12px;color:#64748b;margin-top:24px">
      Tracking code: <b>${code}</b>${trackUrl ? ` &middot; <a href="${trackUrl}">Track this complaint</a>` : ''}<br/>
      This is an automated message from the Council of Leaders Grievance System. Please do not reply directly to this email.
    </p>`

  if (type === 'confirmation') {
    return {
      subject: `We received your complaint (${code})`,
      html: `
        <p>Hi ${name},</p>
        <p>Your formal complaint has been received and logged with the Council of Leaders.</p>
        <p>A representative may reach out to you via <b>Microsoft Teams</b> to confirm the details of your report.</p>
        ${footer}`,
    }
  }

  if (type === 'status') {
    const status = escapeHtml(p.statusLabel || 'updated')
    const summary = p.summary ? `<p><b>Outcome / notes:</b><br/>${escapeHtml(p.summary)}</p>` : ''
    return {
      subject: `Your complaint status changed to "${p.statusLabel}" (${code})`,
      html: `
        <p>Hi ${name},</p>
        <p>The status of your complaint has been updated to: <b>${status}</b>.</p>
        ${summary}
        ${footer}`,
    }
  }

  if (type === 'reply') {
    return {
      subject: `A representative replied to your complaint (${code})`,
      html: `
        <p>Hi ${name},</p>
        <p>A representative has posted a reply on your complaint:</p>
        <blockquote style="margin:12px 0;padding:8px 16px;border-left:3px solid #cbd5e1;color:#334155">
          ${escapeHtml(p.message || '')}
        </blockquote>
        ${footer}`,
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

  const msg = buildMessage(type, body)
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
