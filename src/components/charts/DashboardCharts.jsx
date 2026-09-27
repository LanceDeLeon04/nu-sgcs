import React from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

/* Shared brand / status palette (hex, since recharts can't read Tailwind classes) */
export const BRAND = { blue: '#0033A0', blueLight: '#4d7fff', gold: '#FFC72C', teal: '#0f766e' }
export const STATUS_COLORS = {
  received: '#3b82f6', under_review: '#f59e0b', in_progress: '#6366f1', escalated: '#f97316',
  resolved: '#10b981', closed: '#94a3b8', dismissed: '#ef4444', forwarded: '#14b8a6', noted: '#94a3b8',
}
export const PRIORITY_COLORS = { low: '#94a3b8', normal: '#3b82f6', high: '#f97316', urgent: '#ef4444' }

const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12, boxShadow: '0 8px 20px -6px rgba(15,23,42,0.15)' },
  labelStyle: { fontWeight: 600, color: '#334155' },
}

const axisTick = { fontSize: 11, fill: '#94a3b8' }

const EmptyState = ({ label }) => (
  <div className="h-full min-h-[180px] flex items-center justify-center text-sm text-slate-400">{label}</div>
)

/* Weekly submission volume — stacked area, complaints vs feedback */
export function SubmissionTrendChart({ data }) {
  if (!data?.length) return <EmptyState label="No submissions yet." />
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="fillComplaints" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND.blue} stopOpacity={0.35} />
            <stop offset="100%" stopColor={BRAND.blue} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillFeedback" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND.gold} stopOpacity={0.45} />
            <stop offset="100%" stopColor={BRAND.gold} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Area type="monotone" dataKey="complaints" name="Complaints" stroke={BRAND.blue} strokeWidth={2} fill="url(#fillComplaints)" stackId="1" />
        <Area type="monotone" dataKey="feedback" name="Feedback" stroke={BRAND.gold} strokeWidth={2} fill="url(#fillFeedback)" stackId="1" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* Status breakdown — donut with center total */
export function StatusDonutChart({ data, total }) {
  if (!data?.length) return <EmptyState label="No complaints yet." />
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={58} outerRadius={86} paddingAngle={2} strokeWidth={0}>
            {data.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key] || '#cbd5e1'} />)}
          </Pie>
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: -10 }}>
        <p className="text-2xl font-extrabold text-slate-700">{total}</p>
        <p className="text-[11px] text-slate-400">total</p>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
        {data.map((d) => (
          <span key={d.key} className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[d.key] || '#cbd5e1' }} />
            {d.label} · {d.value}
          </span>
        ))}
      </div>
    </div>
  )
}

/* Priority mix among currently-open complaints */
export function PriorityBarChart({ data }) {
  if (!data?.some((d) => d.value > 0)) return <EmptyState label="No open complaints." />
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={{ ...axisTick, fill: '#64748b' }} axisLine={false} tickLine={false} width={64} />
        <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {data.map((d) => <Cell key={d.key} fill={PRIORITY_COLORS[d.key] || '#cbd5e1'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* How long complaints take to resolve, bucketed */
export function ResolutionHistogram({ data }) {
  if (!data?.some((d) => d.value > 0)) return <EmptyState label="Nothing resolved yet." />
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
        <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill={BRAND.blue} radius={[6, 6, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* Satisfaction rating distribution, 1-5 stars */
export function SatisfactionBarChart({ data }) {
  if (!data?.some((d) => d.value > 0)) return <EmptyState label="No ratings yet." />
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
        <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill={BRAND.gold} radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* Open caseload per staff member */
export function StaffWorkloadChart({ data }) {
  if (!data?.length) return <EmptyState label="No one has open cases assigned." />
  const h = Math.max(140, data.length * 34)
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={{ ...axisTick, fill: '#64748b' }} axisLine={false} tickLine={false} width={96} />
        <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill={BRAND.teal} radius={[0, 6, 6, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}
