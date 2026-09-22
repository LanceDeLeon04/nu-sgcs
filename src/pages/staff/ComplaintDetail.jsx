import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Paperclip, Download, EyeOff, Lock, Globe, Send, Loader2, Trash2, Copy, Check, Save, Star, Users, Forward, AlertTriangle } from 'lucide-react'
import Navbar from '../../components/Navbar.jsx'
import { StatusBadge, PriorityBadge, TypeBadge } from '../../components/StatusBadge.jsx'
import { supabase, EVIDENCE_BUCKET } from '../../supabaseClient'
import { useAuth } from '../../lib/auth.jsx'
import { STATUSES, COMPLAINT_STATUS_KEYS, FEEDBACK_STATUS_KEYS, PRIORITIES, officeLabel, isUnrouted, fmtDate, fmtDateTime, isOverdue, daysOpen } from '../../lib/constants.js'
import OfficePicker from '../../components/OfficePicker.jsx'
import { notifyByEmail } from '../../lib/email.js'

const sel = 'w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder:text-slate-700 bg-white outline-none focus:ring-2 focus:ring-nublue-500'
const lbl = 'text-xs font-bold text-slate-700 uppercase tracking-wide'

function Field({ label, children }) {
  if (!children) return null
  return (<div><p className={lbl}>{label}</p><p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{children}</p></div>)
}

function describe(u) {
  if (u.kind === 'status_change') return `Status: ${STATUSES[u.from_status]?.label || '—'} → ${STATUSES[u.to_status]?.label || u.to_status}`
  if (u.kind === 'submitted') return 'Complaint submitted'
  if (u.kind === 'public_response') return 'Public response'
  if (u.kind === 'internal_note') return 'Internal note'
  if (u.kind === 'follow_up') return 'Complainant follow-up'
  return u.message
}

export default function ComplaintDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session, staff, isAdmin } = useAuth()

  const [c, setC] = useState(null)
  const [updates, setUpdates] = useState([])
  const [files, setFiles] = useState([])
  const [staffAll, setStaffAll] = useState([])
  const [summary, setSummary] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [kind, setKind] = useState('public_response')
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [forwardTo, setForwardTo] = useState(null)

  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignSel, setReassignSel] = useState({ concern_id: '', office_unsure: false })
  const [reassignBusy, setReassignBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data: comp }, { data: ups }, { data: att }, { data: st }] = await Promise.all([
      supabase.from('gc_complaints').select('*').eq('id', id).maybeSingle(),
      supabase.from('gc_updates').select('*').eq('complaint_id', id).order('created_at', { ascending: true }),
      supabase.from('gc_attachments').select('*').eq('complaint_id', id).order('uploaded_at'),
      supabase.from('gc_staff').select('user_id, full_name, position, role, is_active'),
    ])
    if (!comp) { setNotFound(true); return }
    setC(comp); setForwardTo((v) => (v === null ? comp.forwarded_to || '' : v)); setSummary((s) => (s === '' ? comp.resolution_summary || '' : s))
    setUpdates(ups || []); setFiles(att || []); setStaffAll(st || [])
  }, [id])

  useEffect(() => { load() }, [load])

  const save = async (patch) => {
    setErr(''); setBusy(true)
    const { error } = await supabase.from('gc_complaints').update(patch).eq('id', id)
    setBusy(false)
    if (error) { setErr(error.message); return false }
    await load()
    return true
  }

  const changeStatus = async (status) => {
    if (['resolved', 'dismissed', 'closed'].includes(status) && !summary.trim() && !c.resolution_summary) {
      setErr('Write an outcome / resolution summary first — the complainant sees it when a complaint is resolved, closed or dismissed.')
      return
    }
    const ok = await save({ status, resolution_summary: summary.trim() || null })
    if (ok && c.type !== 'feedback' && c.email) {
      notifyByEmail({
        type: 'status',
        to: c.email,
        name: c.complainant_name,
        trackingCode: c.tracking_code,
        trackUrl: `${window.location.origin}/track/${c.tracking_code}`,
        statusKey: status,
        statusLabel: STATUSES[status]?.label || status,
        summary: summary.trim() || c.resolution_summary || null,
      })
    }
  }

  const openFile = async (a) => {
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(a.storage_path, 120)
    if (error) return setErr(error.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const post = async (e) => {
    e.preventDefault()
    if (!note.trim()) return
    const messageText = note.trim()
    const effectiveKind = c.type === 'feedback' ? 'internal_note' : kind
    setPosting(true); setErr('')
    const { error } = await supabase.from('gc_updates').insert({
      complaint_id: id, author_id: session.user.id, author_type: 'staff', author_name: staff.full_name,
      kind: effectiveKind, message: messageText,
    })
    setPosting(false)
    if (error) return setErr(error.message)
    if (effectiveKind === 'public_response' && c.email) {
      notifyByEmail({
        type: 'reply',
        to: c.email,
        name: c.complainant_name,
        trackingCode: c.tracking_code,
        trackUrl: `${window.location.origin}/track/${c.tracking_code}`,
        message: messageText,
      })
    }
    setNote('')
    load()
  }

  const remove = async () => {
    if (!window.confirm(`Permanently delete ${c.reference_no}? This cannot be undone.`)) return
    const { error } = await supabase.from('gc_complaints').delete().eq('id', id)
    if (error) return setErr(error.message)
    navigate('/staff/complaints')
  }

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(c.tracking_code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }

  const reassign = async () => {
    if (!reassignSel.concern_id) { setErr('Choose a department, unit and concern to move this to.'); return }
    setReassignBusy(true); setErr('')
    const { data, error } = await supabase.rpc('gc_reassign_complaint', { p_id: id, p_concern_id: reassignSel.concern_id })
    setReassignBusy(false)
    if (error) { setErr(error.message); return }
    setReassignOpen(false)
    setReassignSel({ concern_id: '', office_unsure: false })
    if (c.email) {
      notifyByEmail({
        type: 'reassigned',
        to: c.email,
        name: c.complainant_name,
        trackingCode: c.tracking_code,
        trackUrl: c.tracking_code ? `${window.location.origin}/track/${c.tracking_code}` : undefined,
        itemLabel: isFeedback ? 'feedback' : 'complaint',
        newLabel: data.new_label,
        oldLabel: data.old_label,
      })
    }
    load()
  }

  if (notFound) return (<div><Navbar title="Complaint" /><p className="p-8 text-sm text-slate-700">Complaint not found (or you don't have access).</p></div>)
  if (!c) return (<div><Navbar title="Complaint" /><p className="p-8 text-sm text-slate-600">Loading…</p></div>)

  const isFeedback = c.type === 'feedback'
  const kindNow = isFeedback ? 'internal_note' : kind
  const statusKeys = isFeedback ? FEEDBACK_STATUS_KEYS : COMPLAINT_STATUS_KEYS
  const forwardDirty = (forwardTo ?? '').trim() !== (c.forwarded_to || '')
  // every active staff member, plus the current assignee even if they've since been deactivated
  const assignees = staffAll.filter((t) => t.is_active || t.user_id === c.assigned_to)
  const assignee = staffAll.find((t) => t.user_id === c.assigned_to)
  const summaryDirty = (summary.trim() || '') !== (c.resolution_summary || '')

  return (
    <div>
      <Navbar title={c.reference_no} crumbs={[]} />
      <div className="p-8">
        <Link to="/staff/complaints" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-nublue-600 mb-4 transition">
          <ArrowLeft size={13} /> All complaints
        </Link>

        {err && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{err}</div>}

        <div className="grid xl:grid-cols-3 gap-5">
          {/* MAIN */}
          <div className="xl:col-span-2 space-y-5 min-w-0">
            <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`${lbl} flex items-center gap-2`}><TypeBadge type={c.type} /> {officeLabel(c)}</p>
                  {isUnrouted(c) && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-orange-800 bg-orange-100 border border-orange-300 rounded-full px-2 py-0.5">
                      Not yet routed — student wasn't sure which office
                    </p>
                  )}
                  {c.flagged_language && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
                      <AlertTriangle size={11} /> Strong language detected in this submission
                    </p>
                  )}
                  <h2 className="text-lg font-bold text-slate-800 mt-0.5 break-words">{c.subject}</h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Submitted {fmtDateTime(c.submitted_at)}
                    {isOverdue(c) && <span className="text-red-500 font-semibold"> · {daysOpen(c)} days open</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">{!isFeedback && <PriorityBadge priority={c.priority} />}<StatusBadge status={c.status} /></div>
              </div>

              <div className="mt-5 bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap break-words">{c.description}</div>

              <div className="grid sm:grid-cols-2 gap-4 mt-5">
                <Field label="Date of incident">{c.incident_date ? fmtDate(c.incident_date) : null}</Field>
                <Field label="Location">{c.incident_location}</Field>
                <Field label={isFeedback ? 'Office / person concerned' : 'Person / office concerned'}>{c.respondent}</Field>
                <Field label="Desired outcome">{c.desired_outcome}</Field>
              </div>

              {files.length > 0 && (
                <div className="mt-5">
                  <p className={`${lbl} mb-2`}>Evidence</p>
                  <ul className="space-y-2">
                    {files.map((a) => (
                      <li key={a.id}>
                        <button onClick={() => openFile(a)}
                          className="w-full flex items-center justify-between gap-2 bg-slate-50 hover:bg-nublue-50 border border-slate-100 rounded-lg px-3 py-2 text-sm text-left transition">
                          <span className="flex items-center gap-2 min-w-0"><Paperclip size={14} className="text-nublue-500 shrink-0" /><span className="truncate">{a.file_name}</span></span>
                          <Download size={14} className="text-slate-600 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* TIMELINE */}
            <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6">
              <h3 className="font-bold text-slate-800 mb-4">Timeline</h3>
              <ul className="space-y-4">
                {updates.map((u) => {
                  const note = u.kind === 'internal_note'
                  const message = ['public_response', 'internal_note', 'follow_up'].includes(u.kind)
                  return (
                    <li key={u.id} className="flex gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${note ? 'bg-amber-400' : u.kind === 'public_response' ? 'bg-nublue-600' : u.kind === 'follow_up' ? 'bg-nugold-500' : 'bg-slate-300'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold">{describe(u)}</span>
                          <span className="text-slate-600"> · {u.author_name || 'System'}</span>
                          {note && <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5"><Lock size={9} /> Internal</span>}
                        </p>
                        {message && u.message && (
                          <p className={`text-sm mt-1 whitespace-pre-wrap rounded-xl px-3 py-2 border ${note ? 'bg-amber-50 border-amber-100 text-amber-900' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>{u.message}</p>
                        )}
                        {!message && u.message && u.kind !== 'submitted' && <p className="text-xs text-slate-700">{u.message}</p>}
                        <p className="text-[11px] text-slate-600 mt-0.5">{fmtDateTime(u.created_at)}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <form onSubmit={post} className="mt-6 pt-5 border-t border-slate-100">
                {isFeedback ? (
                  <p className="text-xs text-slate-700 mb-2 flex items-center gap-1.5"><Lock size={12} className="text-amber-500" /> Internal note — feedback isn't visible to the sender, so use notes to record forwarding and follow-ups.</p>
                ) : (
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setKind('public_response')}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${kind === 'public_response' ? 'bg-nublue-600 text-white border-nublue-600' : 'text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                    <Globe size={12} /> Reply to complainant
                  </button>
                  <button type="button" onClick={() => setKind('internal_note')}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${kind === 'internal_note' ? 'bg-amber-500 text-white border-amber-500' : 'text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                    <Lock size={12} /> Internal note
                  </button>
                </div>
                )}
                <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${sel} resize-y`}
                  placeholder={kindNow === 'public_response' ? 'Visible to the complainant on their tracking page…' : 'Only council staff can see this…'} />
                <button type="submit" disabled={posting || !note.trim()}
                  className="mt-2 bg-nublue-600 hover:bg-nublue-700 text-white font-semibold text-sm px-5 py-2 rounded-xl shadow-glow transition flex items-center gap-2 disabled:opacity-50">
                  {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {kindNow === 'public_response' ? 'Send reply' : 'Save note'}
                </button>
              </form>
            </div>
          </div>

          {/* SIDEBAR */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 space-y-4">
              <h3 className="font-bold text-slate-800">Handling</h3>
              <div><p className={`${lbl} mb-1`}>Status</p>
                <select className={sel} value={c.status} disabled={busy} onChange={(e) => changeStatus(e.target.value)}>
                  {statusKeys.map((k) => <option key={k} value={k}>{STATUSES[k].label}</option>)}
                </select></div>
              {isFeedback && (
                <div><p className={`${lbl} mb-1 flex items-center gap-1`}><Forward size={11} /> Forwarded to (office)</p>
                  <input value={forwardTo ?? ''} onChange={(e) => setForwardTo(e.target.value)} maxLength={200} className={sel} placeholder="e.g. Registrar's Office" />
                  {forwardDirty && (
                    <button onClick={() => save({ forwarded_to: (forwardTo || '').trim() || null, ...(c.status === 'received' && (forwardTo || '').trim() ? { status: 'forwarded' } : {}) })} disabled={busy}
                      className="mt-2 text-xs font-semibold bg-nugold-500 hover:bg-nugold-400 text-nublue-900 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition disabled:opacity-50">
                      <Save size={12} /> Save{c.status === 'received' && (forwardTo || '').trim() ? ' & mark forwarded' : ''}
                    </button>
                  )}</div>
              )}
              {!isFeedback && <div><p className={`${lbl} mb-1`}>Priority</p>
                <select className={sel} value={c.priority} disabled={busy} onChange={(e) => save({ priority: e.target.value })}>
                  {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>}
              <div><p className={`${lbl} mb-1`}>Assigned to</p>
                <select className={sel} value={c.assigned_to || ''} disabled={busy} onChange={(e) => save({ assigned_to: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {assignees.map((t) => (
                    <option key={t.user_id} value={t.user_id}>
                      {t.full_name}{t.user_id === session.user.id ? ' (me)' : ''}{t.position ? ` — ${t.position}` : ''}{!t.is_active ? ' [inactive]' : ''}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[11px] text-slate-600">{assignee ? `Currently: ${assignee.full_name}` : 'Nobody is handling this yet.'}</p>
                  {c.assigned_to !== session.user.id && (
                    <button type="button" disabled={busy} onClick={() => save({ assigned_to: session.user.id })}
                      className="text-[11px] font-semibold text-nublue-600 hover:text-nublue-800 disabled:opacity-50">Assign to me</button>
                  )}
                </div></div>
              {!isFeedback && <div><p className={`${lbl} mb-1`}>Outcome / resolution summary</p>
                <textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} className={`${sel} resize-y`}
                  placeholder="Shown to the complainant once resolved, closed or dismissed." />
                {summaryDirty && (
                  <button onClick={() => save({ resolution_summary: summary.trim() || null })} disabled={busy}
                    className="mt-2 text-xs font-semibold bg-nugold-500 hover:bg-nugold-400 text-nublue-900 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition disabled:opacity-50">
                    <Save size={12} /> Save summary
                  </button>
                )}</div>}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 space-y-3">
              <h3 className="font-bold text-slate-800">{isFeedback ? 'Sender' : 'Complainant'}</h3>
              {c.is_anonymous ? (
                <p className="text-sm text-slate-700 flex items-center gap-2"><EyeOff size={15} /> Sent anonymously — no personal details on record.</p>
              ) : (<>
                <Field label="Name">{c.complainant_name}</Field>
                <Field label="Email">{c.email}</Field>
                <Field label="Student ID">{c.student_id}</Field>
                <Field label="Contact">{c.contact_no}</Field>
                <Field label="Program">{[c.program, c.year_level].filter(Boolean).join(' · ')}</Field>
                {!isFeedback && c.email && (
                  <a href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(c.email)}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-nublue-600 hover:text-nublue-800 bg-nublue-50 hover:bg-nublue-100 rounded-lg px-3 py-1.5 transition">
                    <Users size={13} /> Open in Microsoft Teams
                  </a>
                )}
              </>)}
              {!isFeedback && <p className="text-[11px] text-slate-600">The complainant was told a representative may contact them via Microsoft Teams to confirm the details.</p>}
              {c.satisfaction_rating && (
                <div className="pt-3 border-t border-slate-100">
                  <p className={lbl}>Complainant feedback</p>
                  <p className="flex items-center gap-1 mt-1">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={15} className={n <= c.satisfaction_rating ? 'fill-nugold-400 text-nugold-500' : 'text-slate-300'} />)}</p>
                  {c.satisfaction_comment && <p className="text-sm text-slate-600 mt-1">{c.satisfaction_comment}</p>}
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 space-y-3">
                <h3 className="font-bold text-slate-800">Admin</h3>

                <div>
                  <p className={`${lbl} mb-1`}>Office</p>
                  <p className="text-sm text-slate-700">{officeLabel(c)}</p>
                  {!reassignOpen ? (
                    <button type="button" onClick={() => setReassignOpen(true)}
                      className="mt-2 text-xs font-semibold text-nublue-600 hover:text-nublue-800">
                      {isUnrouted(c) ? 'Route this to an office' : 'Wrong office? Change it'}
                    </button>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <OfficePicker value={reassignSel} onChange={setReassignSel} />
                      <p className="text-[11px] text-slate-500">The {isFeedback ? 'sender' : 'complainant'} will be notified of the change{!c.email ? ' (no email on file, so this will only show on their tracking page).' : '.'}</p>
                      <div className="flex gap-2">
                        <button type="button" disabled={reassignBusy || !reassignSel.concern_id} onClick={reassign}
                          className="text-xs font-semibold bg-nugold-500 hover:bg-nugold-400 text-nublue-900 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition disabled:opacity-50">
                          <Save size={12} /> Save & notify
                        </button>
                        <button type="button" onClick={() => { setReassignOpen(false); setReassignSel({ concern_id: '', office_unsure: false }) }}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {c.tracking_code && <div>
                  <p className={lbl}>Tracking code</p>
                  <button onClick={copyCode} className="mt-1 flex items-center gap-2 font-mono text-sm text-nublue-700 hover:text-nublue-900">
                    {c.tracking_code} {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>}
                <button onClick={remove} className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg px-2 py-1.5 -ml-2 transition">
                  <Trash2 size={13} /> Delete {isFeedback ? 'feedback' : 'complaint'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
