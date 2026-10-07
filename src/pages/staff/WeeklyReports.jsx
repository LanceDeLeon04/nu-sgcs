import React, { useEffect, useMemo, useState } from 'react'
import { Send, Eye, Loader2, CheckCircle2, AlertTriangle, ExternalLink, CalendarRange } from 'lucide-react'
import Navbar from '../../components/Navbar.jsx'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../lib/auth.jsx'
import { useConfirm } from '../../lib/confirm.jsx'

const inp = 'border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-nublue-500 bg-white'
const ymd = (d) => d.toISOString().slice(0, 10)
const phToday = () => new Date(Date.now() + 8 * 3600 * 1000) // UTC fields of this Date = PH wall-clock
const shift = (d, n) => new Date(d.getTime() + n * 86400000)

const PRESETS = [
  { label: 'Last 7 days', get: () => { const t = phToday(); return [ymd(shift(t, -6)), ymd(t)] } },
  { label: 'Last Mon–Sun week', get: () => { const t = phToday(); const dow = (t.getUTCDay() + 6) % 7; const mon = shift(t, -dow - 7); return [ymd(mon), ymd(shift(mon, 6))] } },
  { label: 'Last 30 days', get: () => { const t = phToday(); return [ymd(shift(t, -29)), ymd(t)] } },
  { label: 'This month', get: () => { const t = phToday(); return [ymd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), ymd(t)] } },
]

// Admin-only: email the director summary (with the chart report link) for ANY date range, any time.
// The automatic Friday 5 PM send keeps running regardless of what is sent here.
export default function WeeklyReports() {
  const { session } = useAuth()
  const [depts, setDepts] = useState([])
  const [picked, setPicked] = useState(null) // null = all departments
  const [[from, to], setRange] = useState(PRESETS[0].get())
  const [busy, setBusy] = useState('') // 'preview' | 'send' | ''
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('gc_departments').select('id, name, director_email').order('sort_order').then(({ data }) => setDepts(data || []))
  }, [])

  const selected = useMemo(() => (picked ? depts.filter((d) => picked.includes(d.id)) : depts), [picked, depts])
  const toggle = (id) => setPicked((cur) => { const base = cur ?? depts.map((d) => d.id); return base.includes(id) ? base.filter((x) => x !== id) : [...base, id] })
  const rangeBad = !from || !to || from > to

  const confirm = useConfirm()
  const run = async (dry) => {
    if (!dry && !(await confirm({ title: 'Send director report?', tone: 'primary', confirmText: 'Send now',
      message: `Email the report for ${from} to ${to} to ${selected.length} department director${selected.length === 1 ? '' : 's'} now?\n\nDepartments with no concerns in that range are skipped.` }))) return
    setBusy(dry ? 'preview' : 'send'); setError(''); setResult(null)
    try {
      // Fresh token (supabase refreshes it if it has expired) instead of the one captured at render time.
      const { data: { session: live } } = await supabase.auth.getSession()
      const token = live?.access_token || session?.access_token
      const r = await fetch('/api/send-weekly-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ from, to, dry, departmentIds: picked ?? undefined }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Something went wrong.')
      setResult(j)
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  return (
    <div>
      <Navbar title="Weekly Reports" />
      <div className="p-8 max-w-3xl space-y-5">
        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 space-y-4">
          <div>
            <p className="font-bold text-slate-800 text-sm flex items-center gap-2"><CalendarRange size={16} className="text-nublue-600" /> Send a director report now</p>
            <p className="text-xs text-slate-500 mt-1">Directors still get their automatic summary every Friday at 5:00 PM (PH). Use this to send any other date range at any time — it doesn't affect the Friday send.</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-500">From<input type="date" value={from} max={to || undefined} onChange={(e) => setRange([e.target.value, to])} className={`${inp} block mt-1`} /></label>
            <label className="text-xs font-semibold text-slate-500">To<input type="date" value={to} min={from || undefined} onChange={(e) => setRange([from, e.target.value])} className={`${inp} block mt-1`} /></label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => setRange(p.get())} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-nublue-50 text-nublue-700 hover:bg-nublue-100 transition">{p.label}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Departments ({selected.length} of {depts.length})
              <button onClick={() => setPicked(null)} className="ml-2 text-nublue-600 hover:underline">All</button>
              <button onClick={() => setPicked([])} className="ml-2 text-nublue-600 hover:underline">None</button></p>
            <div className="grid sm:grid-cols-2 gap-1">
              {depts.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-50">
                  <input type="checkbox" checked={!picked || picked.includes(d.id)} onChange={() => toggle(d.id)} />
                  <span className="truncate">{d.name}</span>
                  {!d.director_email && <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded px-1.5 shrink-0">no email</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => run(true)} disabled={!!busy || rangeBad || !selected.length}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
              {busy === 'preview' ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview (sends nothing)
            </button>
            <button onClick={() => run(false)} disabled={!!busy || rangeBad || !selected.length}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-nublue-600 text-white hover:bg-nublue-700 disabled:opacity-50 transition">
              {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send now
            </button>
          </div>
          {rangeBad && <p className="text-xs text-red-500">Choose a start date on or before the end date.</p>}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-2"><AlertTriangle size={15} /> {error}</p>}

        {result && (
          <div className="bg-white rounded-2xl border border-slate-100 card-glow p-5 space-y-3">
            <p className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              {result.dry ? `Preview: ${result.sent.length} director${result.sent.length === 1 ? '' : 's'} would be emailed` : `Sent to ${result.sent.length} director${result.sent.length === 1 ? '' : 's'}`}
              <span className="text-xs font-medium text-slate-400">{result.from} → {result.to}</span>
            </p>
            {result.sent.map((s) => (
              <div key={s.department} className="flex items-center justify-between gap-3 text-sm border-t border-slate-100 pt-2">
                <div className="min-w-0"><p className="font-semibold text-slate-700 truncate">{s.department}</p><p className="text-xs text-slate-400 truncate">{s.to} · {s.total} concern{s.total === 1 ? '' : 's'}</p></div>
                {s.reportUrl && <a href={s.reportUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-nublue-600 hover:underline inline-flex items-center gap-1">Open report <ExternalLink size={12} /></a>}
              </div>
            ))}
            {result.skipped.length > 0 && <ul className="text-xs text-slate-400 border-t border-slate-100 pt-2 space-y-0.5">{result.skipped.map((s) => <li key={s}>Skipped — {s}</li>)}</ul>}
            {result.errors.length > 0 && <ul className="text-xs text-red-600 border-t border-slate-100 pt-2 space-y-0.5">{result.errors.map((s) => <li key={s}>{s}</li>)}</ul>}
          </div>
        )}
      </div>
    </div>
  )
}
