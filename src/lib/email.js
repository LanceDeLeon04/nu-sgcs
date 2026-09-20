// Fire-and-forget helper for the /api/send-email serverless function (Brevo).
// Never throws — a failed email should never block submitting a complaint,
// changing a status, or posting a reply.
export async function notifyByEmail(payload) {
  if (!payload || !payload.to) return
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.warn('notifyByEmail failed:', body.error || res.status)
    }
  } catch (err) {
    console.warn('notifyByEmail error:', err.message)
  }
}
