import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, HelpCircle, Check, X, Loader2 } from 'lucide-react'
import { supabase } from '../supabaseClient'

const selCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nublue-500 bg-white disabled:bg-slate-50 disabled:text-slate-400'
const label = 'text-xs font-semibold text-slate-500 uppercase tracking-wide'

// Cached across all instances on the page (Feedback + Complaint forms share it, and it rarely changes).
let cache = null
let inflight = null
async function loadDirectory() {
  if (cache) return cache
  if (!inflight) {
    inflight = supabase.rpc('gc_get_directory').then(({ data, error }) => {
      inflight = null
      if (error) throw error
      cache = data || []
      return cache
    })
  }
  return inflight
}

/**
 * Lets a student pick Department > Unit > Concern, or say "I'm not sure" and
 * search every concern across every department with a dynamic, type-ahead search.
 *
 * value:    { concern_id, office_unsure }
 * onChange: (next) => void   — called with a full replacement of both fields
 */
export default function OfficePicker({ value, onChange }) {
  const [dirs, setDirs] = useState(null)
  const [err, setErr] = useState('')
  const [deptId, setDeptId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    let alive = true
    loadDirectory().then((d) => { if (alive) setDirs(d) }).catch((e) => { if (alive) setErr(e.message || 'Could not load the office list.') })
    return () => { alive = false }
  }, [])

  // Close the search dropdown on outside click
  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Flat index of every concern, for the "I'm not sure" search and for resolving a pre-selected concern_id.
  const flat = useMemo(() => {
    if (!dirs) return []
    const out = []
    for (const d of dirs) for (const u of d.units) for (const c of u.concerns) {
      out.push({ id: c.id, name: c.name, unitId: u.id, unitName: u.name, deptId: d.id, deptName: d.name })
    }
    return out
  }, [dirs])

  const selected = useMemo(() => flat.find((x) => x.id === value.concern_id) || null, [flat, value.concern_id])

  // If a concern is already selected (e.g. restored from a draft), sync the department/unit dropdowns to match.
  useEffect(() => {
    if (selected && !value.office_unsure) {
      setDeptId(selected.deptId)
      setUnitId(selected.unitId)
    }
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const dept = dirs?.find((d) => d.id === deptId) || null
  const unit = dept?.units.find((u) => u.id === unitId) || null

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return flat
      .filter((c) => `${c.name} ${c.unitName} ${c.deptName}`.toLowerCase().includes(needle))
      .slice(0, 30)
  }, [flat, query])

  const pickNotSure = () => {
    setDeptId(''); setUnitId(''); setQuery('')
    onChange({ concern_id: '', office_unsure: true })
  }

  const pickDept = (id) => {
    setDeptId(id); setUnitId('')
    onChange({ concern_id: '', office_unsure: false })
  }

  const pickUnit = (id) => {
    setUnitId(id)
    onChange({ concern_id: '', office_unsure: false })
  }

  const pickConcern = (id) => {
    onChange({ concern_id: id, office_unsure: false })
  }

  const pickFromSearch = (c) => {
    setDeptId(c.deptId); setUnitId(c.unitId)
    setQuery(''); setOpen(false)
    onChange({ concern_id: c.id, office_unsure: false })
  }

  const clear = () => {
    setDeptId(''); setUnitId(''); setQuery('')
    onChange({ concern_id: '', office_unsure: false })
  }

  if (err) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{err}</p>
  if (!dirs) return <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading departments…</p>

  return (
    <div className="space-y-3">
      {!value.office_unsure ? (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <p className={`${label} mb-1`}>Department</p>
              <select className={selCls} value={deptId} onChange={(e) => pickDept(e.target.value)}>
                <option value="">Select a department…</option>
                {dirs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <p className={`${label} mb-1`}>Unit / office</p>
              <select className={selCls} value={unitId} onChange={(e) => pickUnit(e.target.value)} disabled={!dept}>
                <option value="">{dept ? 'Select a unit…' : 'Choose a department first'}</option>
                {dept?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <p className={`${label} mb-1`}>Concern</p>
              <select className={selCls} value={value.concern_id || ''} onChange={(e) => pickConcern(e.target.value)} disabled={!unit}>
                <option value="">{unit ? 'Select a concern…' : 'Choose a unit first'}</option>
                {unit?.concerns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {selected && (
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
              <Check size={13} /> {selected.deptName} › {selected.unitName} › {selected.name}
            </div>
          )}

          <button type="button" onClick={pickNotSure}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-nublue-600 hover:text-nublue-800">
            <HelpCircle size={13} /> I'm not sure which office this is
          </button>
        </>
      ) : (
        <div className="bg-nublue-50 border border-nublue-100 rounded-xl p-4" ref={boxRef}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-nublue-800 flex items-center gap-1.5"><HelpCircle size={13} /> Not sure? Search for your concern across every office.</p>
            <button type="button" onClick={clear} className="text-nublue-400 hover:text-nublue-700 shrink-0" aria-label="Cancel"><X size={14} /></button>
          </div>
          <div className="relative">
            <div className="flex items-center border border-slate-200 bg-white rounded-xl px-3 focus-within:ring-2 focus-within:ring-nublue-500">
              <Search size={15} className="text-nublue-400 mr-2 shrink-0" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
                onFocus={() => setOpen(true)}
                placeholder='Type what your concern is about… e.g. "grades", "ID", "cafeteria"'
                className="w-full py-2.5 text-sm outline-none bg-transparent"
              />
            </div>
            {open && query.trim() && (
              <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                {results.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-400">No matching concern. You can still submit — the Council will route it for you.</p>
                ) : results.map((c) => (
                  <button key={c.id} type="button" onClick={() => pickFromSearch(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-nublue-50 transition border-b border-slate-50 last:border-0">
                    <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                    <p className="text-[11px] text-slate-400">{c.deptName} › {c.unitName}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-nublue-800/70">
            If you'd rather browse instead, <button type="button" onClick={clear} className="font-bold underline">pick a department manually</button>.
          </p>
        </div>
      )}
    </div>
  )
}
