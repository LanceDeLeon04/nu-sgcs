import React from 'react'
import { STATUSES, PRIORITIES, TYPES } from '../lib/constants.js'

export function StatusBadge({ status }) {
  const s = STATUSES[status] || STATUSES.received
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  )
}

export function PriorityBadge({ priority }) {
  const p = PRIORITIES[priority] || PRIORITIES.normal
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${p.cls}`}>
      {p.label}
    </span>
  )
}

export function TypeBadge({ type }) {
  const t = TYPES[type] || TYPES.complaint
  return (
    <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap ${t.cls}`}>
      {t.label}
    </span>
  )
}
