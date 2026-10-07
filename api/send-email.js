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
function wrap({ eyebrow, heading, bodyHtml, code, trackUrl }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Segoe UI,Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;table-layout:fixed;word-break:break-word;overflow-wrap:anywhere;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,40,125,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, ${NUBLUE} 0%, ${NUBLUE_DARK} 100%);padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" style="width:48px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="40" height="40" style="width:40px;height:40px;background:${NUGOLD};border-radius:10px;">
                      <tr><td align="center" valign="middle" style="width:40px;height:40px;color:${NUBLUE_DARK};font-size:16px;font-weight:800;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.02em;">CoL</td></tr>
                    </table>
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
function buildMessage(type, p) {
  const name = escapeHtml(p.name || 'Student')
  const code = p.trackingCode || ''
  const trackUrl = p.trackUrl || null

  if (type === 'confirmation') {
    return {
      subject: `We received your complaint (${code})`,
      html: wrap({
        eyebrow: 'Complaint received', heading: 'Your complaint has been received',
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
        eyebrow: 'Status update', heading: 'Your complaint status has been updated',
        code, trackUrl,
        bodyHtml: `
          <p style="margin:0 0 14px;">Hi ${name},</p>
          <p style="margin:0 0 6px;">The status of your complaint is now:</p>
          <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};font-size:13px;font-weight:700;">${statusLabel}</span>
          ${summary}`,
      }),
    }
  }

  if (type === 'reassigned') {
    return {
      subject: `Your ${p.itemLabel || 'submission'} was moved to a different office${code ? ` (${code})` : ''}`,
      html: wrap({
        eyebrow: 'Routed to a new office', heading: 'Your submission was moved to a different office',
        code, trackUrl,
        bodyHtml: `
          <p style="margin:0 0 14px;">Hi ${name},</p>
          <p style="margin:0 0 10px;">The Council of Leaders reviewed your ${escapeHtml(p.itemLabel || 'submission')} and routed it to a different office so it reaches the right people:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
            <tr><td style="background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 4px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Now with</p>
              <p style="margin:0;color:#0f172a;font-size:14px;font-weight:700;">${escapeHtml(p.newLabel || '')}</p>
              ${p.oldLabel ? `<p style="margin:6px 0 0;color:#94a3b8;font-size:12px;">Previously: ${escapeHtml(p.oldLabel)}</p>` : ''}
            </td></tr>
          </table>`,
      }),
    }
  }

  if (type === 'reply') {
    return {
      subject: `A representative replied to your complaint (${code})`,
      html: wrap({
        eyebrow: 'New reply', heading: 'A representative replied to your complaint',
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

  if (type === 'office_forward') {
    const office = escapeHtml(p.unitName || 'Office')
    const itemLabel = p.itemType === 'feedback' ? 'feedback' : 'complaint'
    const officeLabel = [p.department, p.unit, p.concern].filter(Boolean).map(escapeHtml).join(' &rsaquo; ')
      || escapeHtml(p.category || '')

    // Reporting student block — respects is_anonymous (feedback only; complaints are never anonymous).
    const identityRows = p.isAnonymous
      ? `<p style="margin:0;color:#64748b;font-size:13.5px;font-style:italic;">Filed anonymously — no identity on file.</p>`
      : [
          ['Name', p.complainantName],
          ['Student ID', p.studentId],
          ['Email', p.complainantEmail],
          ['Contact no.', p.contactNo],
          ['Program', p.program],
          ['Year level', p.yearLevel],
        ].filter(([, v]) => v).map(([k, v]) => `
            <tr>
              <td style="padding:3px 0;color:#64748b;font-size:12.5px;width:110px;">${escapeHtml(k)}</td>
              <td style="padding:3px 0;color:#0f172a;font-size:13.5px;font-weight:600;">${escapeHtml(v)}</td>
            </tr>`).join('')
    const identityHtml = p.isAnonymous ? identityRows
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${identityRows}</table>`

    // Extra case details — incident date/location, respondent, desired outcome (only rendered if present).
    const detailRows = [
      ['Incident date', p.incidentDate ? new Date(p.incidentDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : null],
      ['Incident location', p.incidentLocation],
      ['Concerned person/office', p.respondent],
      ['Desired outcome', p.desiredOutcome],
    ].filter(([, v]) => v).map(([k, v]) => `
          <p style="margin:0 0 8px;"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">${escapeHtml(k)}</span><br/><span style="color:#334155;font-size:13.5px;">${nl2br(v)}</span></p>`).join('')

    return {
      subject: `New ${itemLabel} forwarded to ${office} (${p.referenceNo || ''})`,
      html: wrap({
        eyebrow: `${itemLabel === 'feedback' ? 'Feedback' : 'Complaint'} forwarded`, heading: `A ${itemLabel} was forwarded to ${office}`,
        bodyHtml: `
          <p style="margin:0 0 12px;"><b>Notice:</b> The Council of Leaders received a ${itemLabel} routed to your office and is forwarding the full report to you for action.</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
            <tr><td style="background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:14px 16px;">
              ${officeLabel ? `<p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">${officeLabel}</p>` : ''}
              <p style="margin:0 0 6px;color:#0f172a;font-size:14px;font-weight:700;">${escapeHtml(p.subject || '')}</p>
              <p style="margin:0;color:#334155;font-size:13.5px;">${nl2br(p.summary || '')}</p>
              ${detailRows ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0;">${detailRows}</div>` : ''}
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background:#fffdf5;border:1px solid #ffecad;border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 8px;color:#805f00;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Reporting student</p>
              ${identityHtml}
            </td></tr>
          </table>

          <p style="margin:0 0 10px;">Use the secure link below to view this case and post an update once it's addressed — the case updates automatically on our end when you do.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background:${NUBLUE};border-radius:8px;">
              <a href="${escapeHtml(p.officeUrl || '')}" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">Open &amp; update this case &rarr;</a>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#eef4ff;border:1px solid #d9e6ff;border-radius:12px;padding:16px 20px;">
              <p style="margin:0 0 4px;color:${NUBLUE};font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Access code (required on the link above)</p>
              <p style="margin:0;color:${NUBLUE_DARK};font-size:22px;font-weight:800;font-family:Consolas,Menlo,monospace;letter-spacing:.08em;">${escapeHtml(p.code || '')}</p>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;color:#94a3b8;font-size:11.5px;">Please handle this report's details confidentially and in line with your office's data-privacy obligations.</p>`,
      }),
    }
  }

  if (type === 'office_reminder') {
    const office = escapeHtml(p.unitName || 'your office')
    return {
      subject: `Reminder: update needed on ${p.referenceNo || 'a case'} (${office})`,
      html: wrap({
        eyebrow: 'Reminder', heading: "This case is still awaiting your office's update",
        bodyHtml: `
          <p style="margin:0 0 12px;">This is an automatic reminder — it's been at least 3 days since the last update on this case from your side.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 4px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">${escapeHtml(p.referenceNo || '')}</p>
              <p style="margin:0;color:#0f172a;font-size:14px;font-weight:700;">${escapeHtml(p.subject || '')}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 10px;">Please open the case and post an update, or change its status, using the secure link below.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background:${NUBLUE};border-radius:8px;">
              <a href="${escapeHtml(p.officeUrl || '')}" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">Open &amp; update this case &rarr;</a>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#eef4ff;border:1px solid #d9e6ff;border-radius:12px;padding:16px 20px;">
              <p style="margin:0 0 4px;color:${NUBLUE};font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Access code</p>
              <p style="margin:0;color:${NUBLUE_DARK};font-size:22px;font-weight:800;font-family:Consolas,Menlo,monospace;letter-spacing:.08em;">${escapeHtml(p.code || '')}</p>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;color:#94a3b8;font-size:11.5px;">Reminder #${p.reminderCount || ''} — this will keep repeating every 3 days until the case is resolved.</p>`,
      }),
    }
  }

  if (type === 'director_digest') {
    const dept = escapeHtml(p.departmentName || 'your department')
    const items = Array.isArray(p.items) ? p.items : []
    const counts = Array.isArray(p.statusCounts) ? p.statusCounts : []
    const pills = counts.map((c) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border-radius:999px;background:#eef4ff;border:1px solid #d9e6ff;color:${NUBLUE_DARK};font-size:12px;font-weight:700;">${escapeHtml(c.label)}: ${Number(c.count) || 0}</span>`).join('')
    const rows = items.map((i) => `
            <tr>
              <td style="padding:8px 0;border-top:1px solid #eef2f7;vertical-align:top;">
                <p style="margin:0;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(i.referenceNo || '')} &middot; ${escapeHtml(i.typeLabel || '')} &middot; ${escapeHtml(i.statusLabel || '')}</p>
                <p style="margin:2px 0 0;color:#0f172a;font-size:13.5px;font-weight:600;">${escapeHtml(i.subject || '')}</p>
                ${i.office ? `<p style="margin:2px 0 0;color:#64748b;font-size:12px;">${escapeHtml(i.office)}</p>` : ''}
              </td>
            </tr>`).join('')
    const more = p.moreCount > 0 ? `<p style="margin:10px 0 0;color:#64748b;font-size:12.5px;">&hellip;and ${Number(p.moreCount)} more not listed.</p>` : ''
    const older = p.olderOpen > 0 ? `<p style="margin:14px 0 0;">Also still open from earlier weeks: <b>${Number(p.olderOpen)}</b> complaint${p.olderOpen === 1 ? '' : 's'}.</p>` : ''
    const reportBtn = /^https?:\/\//.test(p.reportUrl || '') ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="background:${NUBLUE};border-radius:10px;"><a href="${escapeHtml(p.reportUrl)}" style="display:inline-block;padding:11px 20px;color:#ffffff;font-size:13.5px;font-weight:700;text-decoration:none;">View the full weekly report (charts &amp; visualizations) &rarr;</a></td></tr></table>` : ''
    return {
      subject: `Weekly summary: ${p.total} concern${p.total === 1 ? '' : 's'} for ${p.departmentName || 'your department'} (${p.periodLabel || ''})`,
      html: wrap({
        eyebrow: 'Weekly summary', heading: `Concerns for ${p.departmentName || 'your department'}`,
        bodyHtml: `
          <p style="margin:0 0 12px;">Here is the Council of Leaders summary of concerns routed to <b>${dept}</b> for <b>${escapeHtml(p.periodLabel || 'this week')}</b>. Individual cases were sent to the responsible offices; this is an overview for your awareness.</p>
          <p style="margin:0 0 8px;"><b>${Number(p.total) || 0}</b> new concern${p.total === 1 ? '' : 's'} this week</p>
          <div style="margin:0 0 12px;">${pills}</div>
          ${reportBtn}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          ${more}${older}
          ${p.reportUrl ? `<p style="margin:14px 0 0;color:#64748b;font-size:12px;">Button not working? <a href="${escapeHtml(p.reportUrl)}" style="color:${NUBLUE};">Open the report in your browser</a>.</p>` : ''}
          <p style="margin:16px 0 0;color:#94a3b8;font-size:11.5px;">Confidential cases are listed without their details, and reporter identities are never included in this summary.</p>`,
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
