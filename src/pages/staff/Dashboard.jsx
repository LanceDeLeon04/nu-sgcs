import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Hourglass, CheckCircle2, AlertTriangle, ArrowRight, Star, MessageSquareText } from 'lucide-react'
import Navbar from '../../components/Navbar.jsx'
import { StatusBadge, TypeBadge } from '../../components/StatusBadge.jsx'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../lib/auth.jsx'
import { STATUSES, STATUS_KEYS, OPEN_STATUSES, fmtDate, isOverdue, daysOpen } from '../../lib/constants.js'

function Bars({ rows, total, color }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 font-medium truncate pr-2">{r.label}</span>
            <span className="text-slate-400 shrink-0">{r.value}{total ? ` · ${Math.round((r.value / total) * 100)}%` : ''}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { staff } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase.from('gc_complaints')
      .select('id, type, reference_no, subject, category, office_department, office_unsure, status, priority, assigned_to, submitted_at, satisfaction_rating')
      .order('submitted_at', { ascending: false })
      .limit(2000)
      .then(({ data }) => setRows(data || []))
  }, [])

  if (!rows) return (<div><Navbar title="Dashboard" /><p className="p-8 text-sm text-slate-400">Loading…</p></div>)

  const complaints = rows.filter((r) => r.type !== 'feedback')
  const feedback = rows.filter((r) => r.type === 'feedback')
  const count = (keys) => complaints.filter((r) => keys.includes(r.status)).length
  const rated = complaints.filter((r) => r.satisfaction_rating)
  const avg = rated.length ? (rated.reduce((a, r) => a + r.satisfaction_rating, 0) / rated.length).toFixed(1) : null
  const unroutedCount = rows.filter((r) => !r.office_department && r.office_unsure).length

  const cards = [
    { label: 'New', sub: 'awaiting review', value: count(['received']), icon: Inbox, color: 'from-nublue-600 to-nublue-500', to: '/staff/complaints?type=complaint&status=received' },
    { label: 'Active', sub: 'under review / in progress', value: count(['under_review', 'in_progress', 'escalated']), icon: Hourglass, color: 'from-nublue-700 to-nublue-600', to: '/staff/complaints?type=complaint&status=open' },
    { label: 'Overdue', sub: 'open for over a week', value: complaints.filter(isOverdue).length, icon: AlertTriangle, color: 'from-red-600 to-red-500', to: '/staff/complaints?type=complaint&status=overdue' },
    { label: 'Resolved', sub: 'resolved or closed', value: count(['resolved', 'closed']), icon: CheckCircle2, color: 'from-nugold-500 to-nugold-400', to: '/staff/complaints?type=complaint&status=done' },
    { label: 'Feedback', sub: 'to forward', value: feedback.filter((r) => r.status === 'received').length, icon: MessageSquareText, color: 'from-teal-700 to-teal-500', to: '/staff/complaints?type=feedback' },
    { label: 'Not routed', sub: 'student wasn\'t sure which office', value: unroutedCount, icon: AlertTriangle, color: 'from-orange-600 to-orange-500', to: '/staff/complaints?department=unrouted' },
  ]

  const byStatus = STATUS_KEYS.map((k) => ({ label: STATUSES[k].label, value: rows.filter((r) => r.status === k).length })).filter((r) => r.value > 0)
  const deptOf = (r) => r.office_department || (r.office_unsure ? 'Not yet routed' : r.category)
  const byCat = [...new Set(rows.map(deptOf))].map((c) => ({ label: c, value: rows.filter((r) => deptOf(r) === c).length })).sort((a, b) => b.value - a.value)

  const attention = rows
    .filter((r) => r.type !== 'feedback' && OPEN_STATUSES.includes(r.status) && (r.status === 'received' || r.priority === 'urgent' || isOverdue(r)))
    .slice(0, 6)

  return (
    <div>
      <Navbar title={`Welcome, ${staff?.full_name?.split(' ')[0] || 'Officer'}`} />
      <div className="p-8">
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-5 mb-8">
          {cards.map((c) => (
            <Link key={c.label} to={c.to}
              className="group relative overflow-hidden rounded-2xl p-6 text-white card-glow hover:-translate-y-0.5 hover:shadow-xl transition-all">
              <div className={`absolute inset-0 bg-gradient-to-br ${c.color}`} />
              <div className="relative z-10">
                <c.icon size={26} className="mb-6 opacity-90" />
                <p className="text-3xl font-extrabold">{c.value}</p>
                <p className="text-sm font-medium opacity-90">{c.label} · {c.sub}</p>
                <div className="flex items-center gap-1 text-xs font-semibold mt-4 opacity-80 group-hover:opacity-100 group-hover:gap-2 transition-all">
                  View <ArrowRight size={13} />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-5 mb-5">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 card-glow p-6">
            <h2 className="font-bold text-slate-800 mb-4">Complaints needing attention</h2>
            {attention.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing urgent — you're all caught up.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attention.map((r) => (
                  <li key={r.id}>
                    <Link to={`/staff/complaints/${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{r.subject}</p>
                        <p className="text-[11px] text-slate-400">{r.reference_no} · {deptOf(r)} · {fmtDate(r.submitted_at)}
                          {isOverdue(r) && <span className="text-red-500 font-semibold"> · {daysOpen(r)} days open</span>}
                          {r.priority === 'urgent' && <span className="text-red-500 font-semibold"> · Urgent</span>}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6">
            <h2 className="font-bold text-slate-800 mb-4">By status <span className="text-xs font-normal text-slate-400">(complaints + feedback)</span></h2>
            {byStatus.length ? <Bars rows={byStatus} total={rows.length} color="bg-nublue-600" /> : <p className="text-sm text-slate-400">No complaints yet.</p>}
            {avg && (
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-sm text-slate-600">
                <Star size={16} className="fill-nugold-400 text-nugold-500" />
                <span className="font-bold">{avg}/5</span> <span className="text-slate-400 text-xs">avg. satisfaction ({rated.length} rating{rated.length > 1 ? 's' : ''})</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6">
          <h2 className="font-bold text-slate-800 mb-4">By department <span className="text-xs font-normal text-slate-400">(complaints + feedback)</span></h2>
          {byCat.length ? <Bars rows={byCat} total={rows.length} color="bg-nugold-500" /> : <p className="text-sm text-slate-400">No complaints yet.</p>}
        </div>
      </div>
    </div>
  )
}
