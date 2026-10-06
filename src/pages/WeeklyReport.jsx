import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Inbox, CheckCircle2, Hourglass, History, Lock } from 'lucide-react'
import Brand from '../components/Brand.jsx'
import Footer from '../components/Footer.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { SubmissionTrendChart, StatusDonutChart, PriorityBarChart, StaffWorkloadChart } from '../components/charts/DashboardCharts.jsx'
import { STATUSES, PRIORITIES, fmtDate } from '../lib/constants.js'

const Stat = ({ icon: Icon, label, value, hint }) => (
  <div className="bg-white rounded-2xl border border-slate-100 card-glow p-4">
    <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wide"><Icon size={14} /> {label}</div>
    <p className="text-2xl font-extrabold text-slate-800 mt-1">{value}</p>
    {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
  </div>
)
const Card = ({ title, sub, children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 card-glow p-5 ${className}`}>
    <h2 className="font-bold text-slate-800 text-sm">{title}</h2>
    {sub && <p className="text-xs text-slate-400 mb-3">{sub}</p>}
    <div className={sub ? '' : 'mt-3'}>{children}</div>
  </div>
)

// Public (token-protected) weekly report opened from the director's Friday summary email.
export default function WeeklyReport() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/weekly-report?token=${encodeURIComponent(token)}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not load the report.'); setData(j) })
      .catch((e) => setError(e.message))
  }, [token])

  return (
    <div className="min-h-screen bg-[#f5f8ff] flex flex-col">
      <header className="bg-white/85 border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3"><Brand /></div>
        <div className="h-[3px] bg-gradient-to-r from-nugold-500 via-nugold-300 to-transparent" />
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
        {error && (
          <div className="bg-white rounded-2xl border border-slate-100 card-glow p-8 text-center max-w-md mx-auto">
            <Lock className="mx-auto text-slate-300 mb-3" size={28} />
            <p className="font-bold text-slate-800">Report unavailable</p>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
          </div>
        )}
        {!error && !data && <p className="text-sm text-slate-400">Loading report…</p>}
        {data && (() => {
          const t = data.totals
          const per = data.rangeDays > 7 ? 'period' : 'week'
          const statusData = data.status.map((s) => ({ ...s, label: STATUSES[s.key]?.label || s.key }))
          const prioData = ['urgent', 'high', 'normal', 'low'].map((k) => ({ key: k, label: PRIORITIES[k]?.label || k, value: data.priority.find((p) => p.key === k)?.value || 0 }))
          return (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-nublue-600">{per === 'week' ? 'Weekly report' : 'Report'}</p>
                <h1 className="text-2xl font-extrabold text-slate-800">{data.department}</h1>
                <p className="text-sm text-slate-500">{data.periodLabel} · statuses shown are current</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat icon={Inbox} label={`New this ${per}`} value={t.total} hint={`${t.complaints} complaints · ${t.feedback} feedback`} />
                <Stat icon={Hourglass} label="Still open" value={t.stillOpen} hint={`of this ${per}'s complaints`} />
                <Stat icon={CheckCircle2} label="Resolved / closed" value={t.resolved} hint={`of this ${per}'s complaints`} />
                <Stat icon={History} label="Older open" value={t.olderOpen} hint={t.olderOpen ? `oldest ${t.oldestOpenDays} days` : 'none from earlier weeks'} />
              </div>
              <div className="grid lg:grid-cols-2 gap-5">
                <Card title={`Volume — last ${data.trend.length} weeks`} sub="Complaints vs feedback routed to this department"><SubmissionTrendChart data={data.trend} /></Card>
                <Card title="Status breakdown" sub={`This ${per}'s concerns`}><StatusDonutChart data={statusData} total={t.total} /></Card>
                <Card title="Open complaints by priority" sub={`This ${per}'s still-open complaints`}><PriorityBarChart data={prioData} /></Card>
                <Card title="Concerns by unit" sub={`Top units this ${per} (confidential cases excluded)`}><StaffWorkloadChart data={data.units} /></Card>
              </div>
              <Card title={`Concerns this ${per} (${t.total})`}>
                {!data.items.length ? <p className="text-sm text-slate-400">No new concerns.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {data.items.map((i) => (
                      <li key={i.referenceNo} className="py-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{i.referenceNo} · {i.type === 'feedback' ? 'Feedback' : 'Complaint'} · {fmtDate(i.submittedAt)}</p>
                          <p className="text-sm font-semibold text-slate-700 truncate">{i.subject}</p>
                          {i.office && <p className="text-xs text-slate-400">{i.office}</p>}
                        </div>
                        <StatusBadge status={i.status} />
                      </li>
                    ))}
                  </ul>
                )}
                {data.moreCount > 0 && <p className="text-xs text-slate-400 mt-2">…and {data.moreCount} more not listed.</p>}
              </Card>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><Lock size={12} /> Reporter identities are never shown. Confidential cases appear without details. This private link expires 60 days after it was sent.</p>
            </div>
          )
        })()}
      </main>
      <Footer className="border-t border-slate-100 bg-white" />
    </div>
  )
}
