import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Lock, Loader2, Send, CheckCircle2, ShieldCheck, Undo2, AlertTriangle } from 'lucide-react'
import PublicShell from '../components/PublicShell.jsx'
import { supabase } from '../supabaseClient'
import { notifyByEmail } from '../lib/email.js'
import { STATUSES, fmtDate, fmtDateTime } from '../lib/constants.js'
import OfficePicker from '../components/OfficePicker.jsx'

const input = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nublue-500 bg-white'

// /office/:ref — nothing about the case is shown until the correct
// 4-digit code (sent in the forwarding email) is entered.
export default function OfficeCase() {
  const { ref } = useParams()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [c, setC] = useState(null)

  const [message, setMessage] = useState('')
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState(false)

  const [redirectOpen, setRedirectOpen] = useState(false)
  const [redirectSel, setRedirectSel] = useState({ concern_id: '', office_unsure: false })
  const [redirectReason, setRedirectReason] = useState('')
  const [redirectBusy, setRedirectBusy] = useState(false)
  const [redirectErr, setRedirectErr] = useState('')

  const [statusBusy, setStatusBusy] = useState(false)
  const [statusErr, setStatusErr] = useState('')

  const unlock = async (e) => {
    e.preventDefault()
    if (!/^[0-9]{4}$/.test(code.trim())) { setErr('Enter the 4-digit code from the email.'); return }
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('gc_office_get_case', { p_ref: ref, p_code: code.trim() })
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (!data) { setErr('Incorrect code, or this link has expired. Double-check the email and try again.'); return }
    setC(data)
  }

  const submitUpdate = async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    setPosting(true); setErr('')
    const { data, error } = await supabase.rpc('gc_office_submit_update', { p_ref: ref, p_code: code.trim(), p_message: message.trim() })
    setPosting(false)
    if (error) { setErr(error.message); return }
    if (data?.notify && data.to_email) {
      notifyByEmail({
        type: 'reply',
        to: data.to_email,
        name: data.name,
        trackingCode: data.tracking_code,
        trackUrl: `${window.location.origin}/track/${data.tracking_code}`,
        message: data.message,
      })
    }
    setMessage('')
    setPosted(true)
    setTimeout(() => setPosted(false), 4000)
  }

  const submitRedirect = async (e) => {
    e.preventDefault()
    setRedirectErr('')
    if (!redirectSel.concern_id) { setRedirectErr('Choose the department, unit and concern this should go to.'); return }
    if (redirectReason.trim().length < 10) { setRedirectErr('Please explain why this should go elsewhere (at least 10 characters).'); return }
    setRedirectBusy(true)
    const { data, error } = await supabase.rpc('gc_office_request_redirect', {
      p_ref: ref, p_code: code.trim(), p_concern_id: redirectSel.concern_id, p_reason: redirectReason.trim(),
    })
    setRedirectBusy(false)
    if (error) { setRedirectErr(error.message); return }
    setRedirectOpen(false)
    setRedirectSel({ concern_id: '', office_unsure: false })
    setRedirectReason('')
    // Refresh the case so the "pending review" banner shows immediately.
    const { data: refreshed } = await supabase.rpc('gc_office_get_case', { p_ref: ref, p_code: code.trim() })
    if (refreshed) setC(refreshed)
  }

  const updateStatus = async (newStatus) => {
    if (!newStatus || newStatus === c.status) return
    setStatusBusy(true); setStatusErr('')
    const { data, error } = await supabase.rpc('gc_office_update_status', { p_ref: ref, p_code: code.trim(), p_status: newStatus })
    setStatusBusy(false)
    if (error) { setStatusErr(error.message); return }
    if (data?.notify && data.to_email) {
      notifyByEmail({
        type: 'status',
        to: data.to_email,
        name: data.name,
        trackingCode: data.tracking_code,
        trackUrl: `${window.location.origin}/track/${data.tracking_code}`,
        statusKey: data.status_key,
        statusLabel: STATUSES[data.status_key]?.label || data.status_key,
      })
    }
    setC((prev) => ({ ...prev, status: newStatus }))
  }

  if (!c) {
    return (
      <PublicShell>
        <div className="max-w-sm mx-auto py-16 px-4">
          <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6 text-center">
            <div className="w-11 h-11 mx-auto rounded-full bg-nublue-50 flex items-center justify-center mb-3">
              <Lock className="text-nublue-600" size={20} />
            </div>
            <h1 className="font-bold text-slate-800">Enter the access code</h1>
            <p className="text-xs text-slate-500 mt-1">This case's details are locked. Enter the 4-digit code from the forwarding email to continue.</p>
            <form onSubmit={unlock} className="mt-4 space-y-3 text-left">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" maxLength={4} placeholder="0000"
                className={`${input} text-center text-lg tracking-[0.4em] font-mono`} />
              {err && <p className="text-xs text-red-600">{err}</p>}
              <button type="submit" disabled={busy}
                className="w-full bg-nublue-600 hover:bg-nublue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Unlock case
              </button>
            </form>
          </div>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <div className="max-w-2xl mx-auto py-10 px-4">
        <p className="text-xs font-bold text-nublue-600 uppercase tracking-wide">{c.reference_no} · {c.type === 'feedback' ? 'Feedback' : 'Complaint'}</p>
        <h1 className="text-xl font-bold text-slate-800 mt-1">{c.subject}</h1>
        <p className="text-xs text-slate-500 mt-1">
          {[c.department, c.unit, c.concern].filter(Boolean).join(' › ')} · Submitted {fmtDateTime(c.submitted_at)}
        </p>
        {c.status && (
          <div className="mt-3 bg-nublue-50 border border-nublue-100 rounded-2xl p-4">
            <p className="text-xs font-bold text-nublue-800 flex items-center gap-1.5"><ShieldCheck size={13} /> Update status</p>
            <p className="text-xs text-nublue-800/80 mt-1">
              {c.is_confidential
                ? "This case is confidential — the Council can't see its details, so please keep the status current yourselves."
                : 'Let the Council know how this case is progressing on your end.'}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <select value={c.status} disabled={statusBusy} onChange={(e) => updateStatus(e.target.value)}
                className={`${input} w-auto`}>
                {(c.type === 'complaint' ? ['under_review', 'in_progress', 'resolved', 'closed'] : ['forwarded', 'noted'])
                  .map((k) => <option key={k} value={k}>{STATUSES[k]?.label || k}</option>)}
              </select>
              {statusBusy && <Loader2 size={14} className="animate-spin text-nublue-600" />}
            </div>
            {statusErr && <p className="text-xs text-red-600 mt-1">{statusErr}</p>}
          </div>
        )}

        {c.redirect_requested_label && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Redirect requested — pending Council review</p>
              <p className="text-xs text-amber-800 mt-0.5">You asked to send this to <span className="font-semibold">{c.redirect_requested_label}</span> on {fmtDateTime(c.redirect_requested_at)}.</p>
              <p className="text-xs text-amber-700 mt-1 italic">"{c.redirect_requested_reason}"</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 mt-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Reporting student</p>
          {c.is_anonymous ? (
            <p className="text-sm text-slate-500 italic">Filed anonymously — no identity on file.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><span className="text-slate-400">Name:</span> <span className="text-slate-700 font-medium">{c.complainant_name || '—'}</span></div>
              <div><span className="text-slate-400">Student ID:</span> <span className="text-slate-700 font-medium">{c.student_id || '—'}</span></div>
              <div><span className="text-slate-400">Email:</span> <span className="text-slate-700 font-medium">{c.complainant_email || '—'}</span></div>
              <div><span className="text-slate-400">Contact no.:</span> <span className="text-slate-700 font-medium">{c.contact_no || '—'}</span></div>
              <div><span className="text-slate-400">Program:</span> <span className="text-slate-700 font-medium">{c.program || '—'}</span></div>
              <div><span className="text-slate-400">Year level:</span> <span className="text-slate-700 font-medium">{c.year_level || '—'}</span></div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 mt-4 space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Description</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{c.description}</p>
          </div>
          {(c.incident_date || c.incident_location) && (
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
              {c.incident_date && <div><p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Incident date</p><p className="text-sm text-slate-700 mt-0.5">{fmtDate(c.incident_date)}</p></div>}
              {c.incident_location && <div><p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Incident location</p><p className="text-sm text-slate-700 mt-0.5">{c.incident_location}</p></div>}
            </div>
          )}
          {c.respondent && <div><p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Concerned person/office</p><p className="text-sm text-slate-700 mt-1">{c.respondent}</p></div>}
          {c.desired_outcome && <div><p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Desired outcome</p><p className="text-sm text-slate-700 mt-1">{c.desired_outcome}</p></div>}
          {c.resolution_summary && <div><p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Council's resolution notes</p><p className="text-sm text-slate-700 mt-1">{c.resolution_summary}</p></div>}
        </div>

        {c.updates?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 mt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">History</p>
            <ul className="space-y-2">
              {c.updates.map((u, i) => (
                <li key={i} className="text-sm text-slate-700 border-l-2 border-slate-200 pl-3">
                  <span className="font-semibold">{u.author}</span> · <span className="text-xs text-slate-500">{fmtDateTime(u.created_at)}</span>
                  {u.message && <p className="text-slate-600 mt-0.5">{u.message}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 mt-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1.5"><Undo2 size={13} /> Wrongly routed to your office?</p>
          <p className="text-xs text-slate-500 mb-2">If this doesn't belong with you, request that the Council send it to the correct department, unit and concern instead. A reason is required, and the case stays with your office until Council staff act on the request.</p>
          {!redirectOpen ? (
            <button type="button" onClick={() => setRedirectOpen(true)}
              className="text-xs font-semibold text-nublue-600 hover:text-nublue-800">
              Request a redirect
            </button>
          ) : (
            <form onSubmit={submitRedirect} className="space-y-3">
              <OfficePicker value={redirectSel} onChange={setRedirectSel} />
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Reason (required)</p>
                <textarea rows={3} value={redirectReason} onChange={(e) => setRedirectReason(e.target.value)}
                  className={`${input} resize-y`} placeholder="e.g. This concerns cafeteria pricing, not our office — it should go to the Business Office." />
              </div>
              {redirectErr && <p className="text-xs text-red-600">{redirectErr}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={redirectBusy || !redirectSel.concern_id || redirectReason.trim().length < 10}
                  className="text-xs font-semibold bg-nublue-600 hover:bg-nublue-700 text-white px-4 py-2 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50">
                  {redirectBusy ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Send request
                </button>
                <button type="button" onClick={() => { setRedirectOpen(false); setRedirectErr(''); setRedirectSel({ concern_id: '', office_unsure: false }); setRedirectReason('') }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-4 py-2 rounded-xl transition">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 mt-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Post an update</p>
          <p className="text-xs text-slate-500 mb-2">Let the Council know what action your office has taken on this case.</p>
          <form onSubmit={submitUpdate} className="space-y-2">
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className={`${input} resize-y`}
              placeholder="e.g. We've spoken with the staff member involved and issued a reminder on…" />
            {err && <p className="text-xs text-red-600">{err}</p>}
            {posted && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={13} /> Update sent to the Council.</p>}
            <button type="submit" disabled={posting || !message.trim()}
              className="bg-nublue-600 hover:bg-nublue-700 text-white font-semibold text-sm px-5 py-2 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
              {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send update
            </button>
          </form>
        </div>
      </div>
    </PublicShell>
  )
}
