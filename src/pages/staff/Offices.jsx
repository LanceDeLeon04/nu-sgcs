import React, { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, Building2, Layers, ListChecks, EyeOff, Eye } from 'lucide-react'
import Navbar from '../../components/Navbar.jsx'
import { supabase } from '../../supabaseClient'

const inp = 'border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-nublue-500 bg-white'
const btn = 'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition'

function AddRow({ placeholder, onAdd, busy }) {
  const [v, setV] = useState('')
  const submit = (e) => { e.preventDefault(); const t = v.trim(); if (!t) return; onAdd(t); setV('') }
  return (
    <form onSubmit={submit} className="flex items-center gap-2 mt-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} maxLength={160} className={`${inp} flex-1`} />
      <button type="submit" disabled={busy || !v.trim()} className={`${btn} bg-nublue-600 hover:bg-nublue-700 text-white disabled:opacity-50`}>
        <Plus size={13} /> Add
      </button>
    </form>
  )
}

function EditableName({ name, onSave, onDelete, onToggleActive, isActive, busy }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(name)
  useEffect(() => setV(name), [name])

  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); const t = v.trim(); if (!t) return; onSave(t); setEditing(false) }}
        className="flex items-center gap-1.5 flex-1 min-w-0">
        <input value={v} onChange={(e) => setV(e.target.value)} maxLength={160} autoFocus className={`${inp} flex-1 min-w-0`} />
        <button type="submit" className="text-emerald-600 hover:text-emerald-800 p-1"><Check size={15} /></button>
        <button type="button" onClick={() => { setV(name); setEditing(false) }} className="text-slate-400 hover:text-slate-600 p-1"><X size={15} /></button>
      </form>
    )
  }
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0 group">
      <span className={`text-sm truncate ${isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{name}</span>
      <button onClick={() => setEditing(true)} className="text-slate-300 hover:text-nublue-600 p-1 opacity-0 group-hover:opacity-100 transition shrink-0"><Pencil size={13} /></button>
      <button onClick={onToggleActive} title={isActive ? 'Hide from the student form' : 'Show on the student form'}
        className="text-slate-300 hover:text-amber-600 p-1 opacity-0 group-hover:opacity-100 transition shrink-0">
        {isActive ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button onClick={onDelete} disabled={busy} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition shrink-0"><Trash2 size={13} /></button>
    </div>
  )
}

export default function Offices() {
  const [depts, setDepts] = useState(null)
  const [units, setUnits] = useState([])
  const [concerns, setConcerns] = useState([])
  const [openDept, setOpenDept] = useState(null)
  const [openUnit, setOpenUnit] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data: d, error: e1 }, { data: u, error: e2 }, { data: c, error: e3 }] = await Promise.all([
      supabase.from('gc_departments').select('*').order('sort_order'),
      supabase.from('gc_units').select('*').order('sort_order'),
      supabase.from('gc_concerns').select('*').order('sort_order'),
    ])
    if (e1 || e2 || e3) { setErr((e1 || e2 || e3).message); return }
    setDepts(d || []); setUnits(u || []); setConcerns(c || [])
  }, [])
  useEffect(() => { load() }, [load])

  const guard = async (fn) => {
    setErr(''); setBusy(true)
    try { await fn() } catch (e) { setErr(e.message || 'Something went wrong.') }
    setBusy(false)
  }

  const addDept = (name) => guard(async () => {
    const sort_order = (depts?.length || 0) + 1
    const { error } = await supabase.from('gc_departments').insert({ name, sort_order })
    if (error) throw error
    load()
  })
  const addUnit = (department_id, name) => guard(async () => {
    const sort_order = units.filter((u) => u.department_id === department_id).length + 1
    const { error } = await supabase.from('gc_units').insert({ department_id, name, sort_order })
    if (error) throw error
    load()
  })
  const addConcern = (unit_id, name) => guard(async () => {
    const sort_order = concerns.filter((c) => c.unit_id === unit_id).length + 1
    const { error } = await supabase.from('gc_concerns').insert({ unit_id, name, sort_order })
    if (error) throw error
    load()
  })

  const renameDept = (id, name) => guard(async () => { const { error } = await supabase.from('gc_departments').update({ name }).eq('id', id); if (error) throw error; load() })
  const renameUnit = (id, name) => guard(async () => { const { error } = await supabase.from('gc_units').update({ name }).eq('id', id); if (error) throw error; load() })
  const renameConcern = (id, name) => guard(async () => { const { error } = await supabase.from('gc_concerns').update({ name }).eq('id', id); if (error) throw error; load() })

  const toggleDept = (row) => guard(async () => { const { error } = await supabase.from('gc_departments').update({ is_active: !row.is_active }).eq('id', row.id); if (error) throw error; load() })
  const toggleUnit = (row) => guard(async () => { const { error } = await supabase.from('gc_units').update({ is_active: !row.is_active }).eq('id', row.id); if (error) throw error; load() })
  const toggleConcern = (row) => guard(async () => { const { error } = await supabase.from('gc_concerns').update({ is_active: !row.is_active }).eq('id', row.id); if (error) throw error; load() })

  const delDept = (row) => {
    if (!window.confirm(`Delete "${row.name}" and every unit/concern under it? Existing submissions keep their office on record but the item won't be selectable anymore.`)) return
    guard(async () => { const { error } = await supabase.from('gc_departments').delete().eq('id', row.id); if (error) throw error; load() })
  }
  const delUnit = (row) => {
    if (!window.confirm(`Delete "${row.name}" and its concerns?`)) return
    guard(async () => { const { error } = await supabase.from('gc_units').delete().eq('id', row.id); if (error) throw error; load() })
  }
  const delConcern = (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return
    guard(async () => { const { error } = await supabase.from('gc_concerns').delete().eq('id', row.id); if (error) throw error; load() })
  }

  if (!depts) return (<div><Navbar title="Offices & Concerns" /><p className="p-8 text-sm text-slate-400">Loading…</p></div>)

  return (
    <div>
      <Navbar title="Offices & Concerns" />
      <div className="p-8 max-w-4xl">
        <p className="text-sm text-slate-500 mb-5">
          This is what students pick on the submission form: Department <ChevronRight size={12} className="inline" /> Unit <ChevronRight size={12} className="inline" /> Concern.
          Hiding an item (the eye icon) removes it from the form without deleting past submissions that used it.
        </p>
        {err && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{err}</div>}

        <div className="space-y-3">
          {depts.map((d) => {
            const deptUnits = units.filter((u) => u.department_id === d.id)
            const isOpen = openDept === d.id
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-slate-100 card-glow overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3">
                  <button onClick={() => setOpenDept(isOpen ? null : d.id)} className="text-slate-400 hover:text-slate-600 shrink-0">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <Building2 size={15} className="text-nublue-600 shrink-0" />
                  <EditableName name={d.name} isActive={d.is_active} busy={busy}
                    onSave={(v) => renameDept(d.id, v)} onDelete={() => delDept(d)} onToggleActive={() => toggleDept(d)} />
                  <span className="text-[11px] text-slate-400 shrink-0">{deptUnits.length} unit{deptUnits.length !== 1 ? 's' : ''}</span>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/60 space-y-3">
                    {deptUnits.map((u) => {
                      const unitConcerns = concerns.filter((c) => c.unit_id === u.id)
                      const uOpen = openUnit === u.id
                      return (
                        <div key={u.id} className="bg-white rounded-xl border border-slate-100">
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button onClick={() => setOpenUnit(uOpen ? null : u.id)} className="text-slate-400 hover:text-slate-600 shrink-0">
                              {uOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <Layers size={13} className="text-nugold-600 shrink-0" />
                            <EditableName name={u.name} isActive={u.is_active} busy={busy}
                              onSave={(v) => renameUnit(u.id, v)} onDelete={() => delUnit(u)} onToggleActive={() => toggleUnit(u)} />
                            <span className="text-[11px] text-slate-400 shrink-0">{unitConcerns.length}</span>
                          </div>

                          {uOpen && (
                            <div className="border-t border-slate-100 px-3 py-2.5 space-y-1.5">
                              {unitConcerns.map((c) => (
                                <div key={c.id} className="flex items-center gap-2 pl-4">
                                  <ListChecks size={12} className="text-slate-400 shrink-0" />
                                  <EditableName name={c.name} isActive={c.is_active} busy={busy}
                                    onSave={(v) => renameConcern(c.id, v)} onDelete={() => delConcern(c)} onToggleActive={() => toggleConcern(c)} />
                                </div>
                              ))}
                              <div className="pl-4"><AddRow placeholder="New concern (e.g. Email concerns)" busy={busy} onAdd={(name) => addConcern(u.id, name)} /></div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <AddRow placeholder="New unit (e.g. IT Services Office)" busy={busy} onAdd={(name) => addUnit(d.id, name)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-5 bg-white rounded-2xl border border-slate-100 card-glow p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Add a department</p>
          <AddRow placeholder="New department (e.g. Administration/Executive)" busy={busy} onAdd={addDept} />
        </div>
      </div>
    </div>
  )
}
