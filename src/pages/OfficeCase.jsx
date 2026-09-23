import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Lock, Loader2, Send, CheckCircle2, ShieldCheck } from 'lucide-react'
import PublicShell from '../components/PublicShell.jsx'
import { supabase } from '../supabaseClient'
import { STATUSES, fmtDateTime } from '../lib/constants.js'

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
    const { error } = await supabase.rpc('gc_office_submit_update', { p_ref: ref, p_code: code.trim(), p_message: message.trim() })
    setPosting(false)
    if (error) { setErr(error.message); return }
    setMessage('')
    setPosted(true)
    setTimeout(() => setPosted(false), 4000)
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
          <span className="inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {STATUSES[c.status]?.label || c.status}
          </span>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 mt-4 space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Description</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{c.description}</p>
          </div>
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
