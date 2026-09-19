import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search, Loader2, Send, Star, CheckCircle2, Circle, Clock, MessageSquare, Building2, User, Cog } from 'lucide-react'
import PublicShell from '../components/PublicShell.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { supabase } from '../supabaseClient'
import { STATUSES, fmtDate, fmtDateTime } from '../lib/constants.js'

const STEPS = ['Received', 'Under Review', 'In Progress', 'Resolved', 'Closed']

const input = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nublue-500 bg-white'

function Progress({ status }) {
  if (status === 'dismissed') {
    return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">This complaint was reviewed and dismissed. See the explanation below.</p>
  }
  const cur = STATUSES[status]?.step ?? 0
  return (
    <div className="flex items-start">
      {STEPS.map((s, i) => {
        const done = i < cur || (i === cur && cur === 4)
        const now = i === cur && cur !== 4
        return (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center text-center w-16 sm:w-20">
              {done ? <CheckCircle2 size={22} className="text-emerald-500" />
                : now ? <div className="w-[22px] h-[22px] rounded-full bg-nublue-600 ring-4 ring-nublue-100 animate-pulse" />
                : <Circle size={22} className="text-slate-300" />}
              <span className={`text-[10px] sm:text-[11px] mt-1.5 font-semibold leading-tight ${now ? 'text-nublue-700' : done ? 'text-slate-600' : 'text-slate-400'}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mt-[10px] ${i < cur ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function TimelineItem({ u }) {
  const Icon = u.kind === 'public_response' ? Building2 : u.kind === 'follow_up' ? User : u.kind === 'status_change' ? Clock : Cog
  const title =
    u.kind === 'status_change' ? `Status changed to ${STATUSES[u.to_status]?.label || u.to_status}`
    : u.kind === 'public_response' ? 'Response from the Council of Leaders'
    : u.kind === 'follow_up' ? 'Your follow-up'
    : u.message || 'Update'
  return (
    <li className="flex gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${u.kind === 'public_response' ? 'bg-nublue-600 text-white' : u.kind === 'follow_up' ? 'bg-nugold-400 text-nublue-900' : 'bg-slate-100 text-slate-500'}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0 pb-5">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {(u.kind === 'public_response' || u.kind === 'follow_up') && u.message && (
          <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{u.message}</p>
        )}
        <p className="text-[11px] text-slate-400 mt-1">{fmtDateTime(u.created_at)}</p>
      </div>
    </li>
  )
}

export default function TrackComplaint() {
  const { code: urlCode } = useParams()
  const navigate = useNavigate()
  const [code, setCode] = useState(urlCode || '')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState(null)

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')

  const lookup = useCallback(async (c) => {
    const trimmed = (c || '').trim()
    if (!trimmed) return
    setLoading(true); setError(''); setNotice(null)
    const { data, error } = await supabase.rpc('gc_track_complaint', { p_code: trimmed })
    setLoading(false)
    if (error) { setError(error.message); setData(null); return }
    if (!data) { setError('No complaint found for that code. Check for typos and try again. (Only formal complaints have tracking codes. Feedback is not trackable.)'); setData(null); return }
    setData(data)
  }, [])

  useEffect(() => { if (urlCode) { setCode(urlCode); lookup(urlCode) } }, [urlCode, lookup])

  const onSubmit = (e) => {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c === (urlCode || '').toUpperCase()) lookup(c)
    else navigate(`/track/${encodeURIComponent(c)}`)
  }

  const sendFollowup = async (e) => {
    e.preventDefault()
    setNotice(null)
    setSending(true)
    const { error } = await supabase.rpc('gc_add_followup', { p_code: data.tracking_code, p_message: msg })
    setSending(false)
    if (error) return setNotice({ type: 'error', text: error.message })
    setMsg('')
    setNotice({ type: 'success', text: 'Your message was sent to the Council.' })
    lookup(data.tracking_code)
  }

  const sendRating = async (e) => {
    e.preventDefault()
    setNotice(null)
    const { error } = await supabase.rpc('gc_rate_resolution', { p_code: data.tracking_code, p_rating: rating, p_comment: comment })
    if (error) return setNotice({ type: 'error', text: error.message })
    setNotice({ type: 'success', text: 'Thank you for your feedback.' })
    lookup(data.tracking_code)
  }

  const closedForGood = data && ['closed', 'dismissed'].includes(data.status)
  const canRate = data && ['resolved', 'closed'].includes(data.status) && !data.satisfaction_rating

  return (
    <PublicShell>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-nublue-700 gold-underline inline-block">Track a Complaint</h1>
        <p className="text-sm text-slate-500 mt-3">Enter the tracking code you received when you filed your formal complaint (looks like <span className="font-mono">GC-1A2B-3C4D-5E6F</span>).</p>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-slate-100 card-glow p-4 flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GC-XXXX-XXXX-XXXX"
          className={`${input} font-mono tracking-wide`} autoComplete="off" spellCheck={false} />
        <button type="submit" disabled={loading}
          className="bg-nublue-600 hover:bg-nublue-700 text-white font-semibold text-sm px-5 rounded-xl shadow-glow transition flex items-center gap-2 disabled:opacity-60">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Track
        </button>
      </form>

      {error && <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</div>}

      {data && (
        <div className="mt-6 space-y-5 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{data.category}</p>
                <h2 className="text-lg font-bold text-slate-800 mt-0.5">{data.subject}</h2>
                <p className="text-xs text-slate-400 mt-1">Filed {fmtDate(data.submitted_at)} · Last update {fmtDate(data.updated_at)}{data.is_anonymous ? ' · Anonymous' : ''}</p>
              </div>
              <StatusBadge status={data.status} />
            </div>
            <div className="mt-6"><Progress status={data.status} /></div>

            {data.resolution_summary && (
              <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">Outcome</p>
                <p className="text-sm text-emerald-900 whitespace-pre-wrap">{data.resolution_summary}</p>
              </div>
            )}
          </div>

          {notice && (
            <div className={`text-sm rounded-xl px-4 py-2.5 border ${notice.type === 'error' ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>{notice.text}</div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6">
            <h3 className="font-bold text-slate-800 mb-4">Activity</h3>
            <ul>{data.updates.map((u) => <TimelineItem key={u.id} u={u} />)}</ul>
          </div>

          {!closedForGood && (
            <form onSubmit={sendFollowup} className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-1"><MessageSquare size={16} className="text-nublue-600" /> Send a message to the Council</h3>
              <p className="text-xs text-slate-400 mb-3">Add details or reply to a question. {data.status === 'resolved' && 'Sending a message will reopen this complaint for review.'}</p>
              <textarea rows={3} className={`${input} resize-y`} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={2000} required minLength={3} />
              <button type="submit" disabled={sending || msg.trim().length < 3}
                className="mt-3 bg-nublue-600 hover:bg-nublue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-glow transition flex items-center gap-2 disabled:opacity-60">
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
              </button>
            </form>
          )}

          {canRate && (
            <form onSubmit={sendRating} className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6">
              <h3 className="font-bold text-slate-800 mb-1">How was your experience?</h3>
              <p className="text-xs text-slate-400 mb-3">Rate how your concern was handled. This helps the Council improve.</p>
              <div className="flex gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button type="button" key={n} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>
                    <Star size={28} className={n <= rating ? 'fill-nugold-400 text-nugold-500' : 'text-slate-300'} />
                  </button>
                ))}
              </div>
              <textarea rows={2} className={`${input} resize-y`} placeholder="Comments (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
              <button type="submit" disabled={!rating}
                className="mt-3 bg-nugold-500 hover:bg-nugold-400 text-nublue-900 font-bold text-sm px-5 py-2.5 rounded-xl transition disabled:opacity-50">
                Submit feedback
              </button>
            </form>
          )}

          {data.satisfaction_rating && (
            <p className="text-xs text-slate-400 text-center">You rated this outcome {data.satisfaction_rating}/5. Thank you.</p>
          )}
        </div>
      )}
    </PublicShell>
  )
}
