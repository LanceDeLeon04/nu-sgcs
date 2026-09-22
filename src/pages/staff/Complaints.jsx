import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, EyeOff, Paperclip, AlertTriangle } from 'lucide-react'
import Navbar from '../../components/Navbar.jsx'
import { StatusBadge, PriorityBadge, TypeBadge } from '../../components/StatusBadge.jsx'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../lib/auth.jsx'
import { STATUSES, STATUS_KEYS, COMPLAINT_STATUS_KEYS, FEEDBACK_STATUS_KEYS, PRIORITIES, OPEN_STATUSES, officeLabel, isUnrouted, fmtDate, isOverdue, daysOpen } from '../../lib/constants.js'

const sel = 'border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-nublue-500'

export default function Complaints() {
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [staffMap, setStaffMap] = useState({})
  const [q, setQ] = useState('')

  const type = params.get('type') || 'all'         // all | complaint | feedback
  const status = params.get('status') || 'all'   // status key | all | open | overdue | done
  const department = params.get('department') || 'all'
  const priority = params.get('priority') || 'all'
  const assignee = params.get('assignee') || 'all' // all | me | none | <staff user_id>

  const setParam = (k, v) => {
    const next = new URLSearchParams(params)
    if (v === 'all') next.delete(k); else next.set(k, v)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: s }] = await Promise.all([
        supabase.from('gc_complaints')
          .select('id, type, reference_no, subject, category, subcategory, office_department, office_unit, office_concern, office_unsure, flagged_language, status, priority, assigned_to, forwarded_to, is_anonymous, complainant_name, respondent, submitted_at, gc_attachments(id)')
          .order('submitted_at', { ascending: false }).limit(2000),
        supabase.from('gc_staff').select('user_id, full_name'),
      ])
      setRows(c || [])
      setStaffMap(Object.fromEntries((s || []).map((x) => [x.user_id, x.full_name])))
    })()
  }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (type !== 'all' && r.type !== type) return false
      if (status === 'open' && !OPEN_STATUSES.includes(r.status)) return false
      if (status === 'done' && !['resolved', 'closed'].includes(r.status)) return false
      if (status === 'overdue' && !isOverdue(r)) return false
      if (STATUS_KEYS.includes(status) && r.status !== status) return false
      if (department !== 'all' && department !== 'unrouted' && (r.office_department || r.category) !== department) return false
      if (department === 'unrouted' && !isUnrouted(r)) return false
      if (priority !== 'all' && r.priority !== priority) return false
      if (assignee === 'me' && r.assigned_to !== session.user.id) return false
      if (assignee === 'none' && r.assigned_to) return false
      if (!['all', 'me', 'none'].includes(assignee) && r.assigned_to !== assignee) return false
      if (needle) {
        const hay = [r.reference_no, r.subject, r.complainant_name, r.respondent, r.category, r.subcategory].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [rows, q, type, status, category, priority, assignee, session])

  return (
    <div>
      <Navbar title="Complaints & Feedback" />
      <div className="p-8">
        <div className="flex gap-2 mb-4">
          {[['all', 'All'], ['complaint', 'Complaints'], ['feedback', 'Feedback']].map(([k, l]) => (
            <button key={k} onClick={() => { const n = new URLSearchParams(params); if (k === 'all') n.delete('type'); else n.set('type', k); n.delete('status'); n.delete('department'); setParams(n, { replace: true }) }}
              className={`text-sm font-semibold px-4 py-1.5 rounded-full border transition ${type === k ? 'bg-nublue-600 text-white border-nublue-600 shadow-glow' : 'bg-white text-slate-500 border-slate-200 hover:bg-nublue-50'}`}>
              {l}{rows ? <span className="ml-1.5 text-[11px] opacity-70">{k === 'all' ? rows.length : rows.filter((r) => r.type === k).length}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="flex items-center border border-slate-200 bg-white rounded-xl px-3 focus-within:ring-2 focus-within:ring-nublue-500 flex-1 min-w-[220px]">
            <Search size={15} className="text-nublue-400 mr-2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, subject, name, respondent…"
              className="w-full py-2 text-sm outline-none bg-transparent" />
          </div>
          <select className={sel} value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="all">All statuses</option>
            <option value="open">Open (any)</option>
            {type !== 'feedback' && <option value="overdue">Overdue</option>}
            {type !== 'feedback' && <option value="done">Resolved / closed</option>}
            {(type === 'feedback' ? FEEDBACK_STATUS_KEYS : type === 'complaint' ? COMPLAINT_STATUS_KEYS : STATUS_KEYS).map((k) => <option key={k} value={k}>{STATUSES[k].label}</option>)}
          </select>
          <select className={sel} value={department} onChange={(e) => setParam('department', e.target.value)}>
            <option value="all">All departments</option>
            <option value="unrouted">Not yet routed</option>
            {[...new Set(rows.map((r) => r.office_department || r.category).filter(Boolean))].sort().map((d) => <option key={d}>{d}</option>)}
          </select>
          {type !== 'feedback' && (
            <select className={sel} value={priority} onChange={(e) => setParam('priority', e.target.value)}>
              <option value="all">All priorities</option>
              {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          <select className={sel} value={assignee} onChange={(e) => setParam('assignee', e.target.value)}>
            <option value="all">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {Object.entries(staffMap).filter(([id]) => id !== session.user.id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>

        {!rows ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">No complaints match your filters.</div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{filtered.length} complaint{filtered.length > 1 ? 's' : ''}</p>
            {filtered.map((r) => (
              <Link key={r.id} to={`/staff/complaints/${r.id}`}
                className="block bg-white rounded-2xl border border-slate-100 card-glow p-5 hover:-translate-y-0.5 hover:shadow-lg transition-all animate-fade-in">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.status === 'received' && <span className="w-2 h-2 rounded-full bg-nublue-500" title="New" />}
                      <TypeBadge type={r.type} />
                      <p className="font-semibold text-sm text-slate-800 truncate">{r.subject}</p>
                      {r.flagged_language && (
                        <span title="Strong language detected" className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-1.5 py-0.5">
                          <AlertTriangle size={10} /> Language
                        </span>
                      )}
                      {isUnrouted(r) && (
                        <span title="Student wasn't sure which office" className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-800 bg-orange-100 border border-orange-300 rounded-full px-1.5 py-0.5">
                          Not yet routed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      <span className="font-mono">{r.reference_no}</span> · {officeLabel(r)} · {fmtDate(r.submitted_at)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        {r.is_anonymous ? <><EyeOff size={11} /> Anonymous</> : <>From {r.complainant_name}</>}
                      </span>
                      {r.respondent && <span>Re: {r.respondent}</span>}
                      {r.forwarded_to && <span>→ {r.forwarded_to}</span>}
                      <span>{r.assigned_to ? `Assigned to ${staffMap[r.assigned_to] || 'staff'}` : 'Unassigned'}</span>
                      {r.gc_attachments?.length > 0 && <span className="flex items-center gap-1"><Paperclip size={11} />{r.gc_attachments.length}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge status={r.status} />
                    <div className="flex items-center gap-1.5">
                      {isOverdue(r) && <span className="text-[11px] font-semibold text-red-500">{daysOpen(r)}d open</span>}
                      {r.type !== 'feedback' && <PriorityBadge priority={r.priority} />}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
