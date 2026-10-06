import React, { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, Building2, Layers, ListChecks, EyeOff, Eye, Mail, AlertTriangle, Hash } from 'lucide-react'
import Navbar from '../../components/Navbar.jsx'
import { supabase } from '../../supabaseClient'

const inp = 'border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-nublue-500 bg-white'
const btn = 'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const CODE_RE = /^[A-Z0-9]{2,8}$/

function UnitCode({ unit, onSave, busy }) {
  const [v, setV] = useState(unit.code || '')
  useEffect(() => setV(unit.code || ''), [unit.code])
  const t = v.trim().toUpperCase()
  const invalid = !CODE_RE.test(t) || t === 'UNR'
  const dirty = t !== (unit.code || '')
  return (
    <div className="pl-4 pb-2.5 pt-1">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><Hash size={11} /> Unit code</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input value={v} onChange={(e) => setV(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} maxLength={8}
          placeholder="e.g. ACCT" className={`${inp} w-28 font-mono uppercase ${t && invalid ? 'border-red-300' : ''}`} />
        {dirty && (
          <button onClick={() => onSave(t)} disabled={busy || invalid}
            className={`${btn} bg-nugold-500 hover:bg-nugold-400 text-nublue-900 disabled:opacity-50`}>
            <Check size={13} /> Save code
          </button>
        )}
        <span className="text-[11px] text-slate-500">Complaints: <span className="font-mono">GC-{t || 'CODE'}-0001</span> · Feedback: <span className="font-mono">FB-{t || 'CODE'}-0001</span></span>
      </div>
      {t && invalid && <p className="text-[10px] text-red-500 mt-0.5">{t === 'UNR' ? 'UNR is reserved for unrouted cases.' : '2 to 8 letters or digits.'}</p>}
      <p className="text-[10px] text-slate-400 mt-1">Changing the code only affects new cases. Existing case numbers stay as issued.</p>
    </div>
  )
}

function UnitEmails({ unit, onSave, busy }) {
  const [email, setEmail] = useState(unit.email || '')
  const [headEmail, setHeadEmail] = useState(unit.head_email || '')
  useEffect(() => { setEmail(unit.email || ''); setHeadEmail(unit.head_email || '') }, [unit.email, unit.head_email])

  const dirty = (email.trim() || '') !== (unit.email || '') || (headEmail.trim() || '') !== (unit.head_email || '')
  const emailErr = email.trim() && !EMAIL_RE.test(email.trim())
  const headErr = headEmail.trim() && !EMAIL_RE.test(headEmail.trim())
  const bothMissing = !unit.email && !unit.head_email

  return (
    <div className="pl-4 pb-2.5 pt-1 border-t border-slate-100 mt-1.5">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><Mail size={11} /> Unit email &amp; head email</p>
      {bothMissing && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2 flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> No email on file yet — staff handling a ticket for this unit will be told to follow up manually.
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="office email, e.g. itso@nu-laguna.edu.ph" className={`${inp} w-full ${emailErr ? 'border-red-300' : ''}`} />
          {emailErr && <p className="text-[10px] text-red-500 mt-0.5">Not a valid email.</p>}
        </div>
        <div>
          <input value={headEmail} onChange={(e) => setHeadEmail(e.target.value)} type="email" placeholder="unit head email (optional)" className={`${inp} w-full ${headErr ? 'border-red-300' : ''}`} />
          {headErr && <p className="text-[10px] text-red-500 mt-0.5">Not a valid email.</p>}
        </div>
      </div>
      {dirty && !emailErr && !headErr && (
        <button onClick={() => onSave({ email: email.trim() || null, head_email: headEmail.trim() || null })} disabled={busy}
          className={`${btn} mt-2 bg-nugold-500 hover:bg-nugold-400 text-nublue-900 disabled:opacity-50`}>
          <Check size={13} /> Save emails
        </button>
      )}
    </div>
  )
}

function DirectorEmail({ dept, onSave, busy }) {
  const [v, setV] = useState(dept.director_email || '')
  useEffect(() => setV(dept.director_email || ''), [dept.director_email])
  const t = v.trim()
  const invalid = !t || !EMAIL_RE.test(t)
  const dirty = t !== (dept.director_email || '')
  return (
    <div className="pb-3 border-b border-slate-200">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><Mail size={11} /> Department director email <span className="text-red-500">*</span></p>
      {!dept.director_email && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mb-2 flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> Required — every department must have a director email. The director gets one weekly summary of this department's concerns every Friday (not each concern).
        </p>
      )}
      <div className="flex items-center gap-2">
        <input value={v} onChange={(e) => setV(e.target.value)} type="email" required placeholder="director email, e.g. director@nu-laguna.edu.ph"
          className={`${inp} flex-1 ${t && invalid ? 'border-red-300' : ''}`} />
        {dirty && (
          <button onClick={() => onSave(t)} disabled={busy || invalid}
            className={`${btn} bg-nugold-500 hover:bg-nugold-400 text-nublue-900 disabled:opacity-50`}>
            <Check size={13} /> Save
          </button>
        )}
      </div>
      {t && invalid && <p className="text-[10px] text-red-500 mt-0.5">Not a valid email.</p>}
    </div>
  )
}

function AddDepartment({ onAdd, busy }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const n = name.trim(), e = email.trim()
  const emailOk = EMAIL_RE.test(e)
  const submit = (ev) => { ev.preventDefault(); if (!n || !emailOk) return; onAdd(n, e); setName(''); setEmail('') }
  return (
    <form onSubmit={submit} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mt-2">
      <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="New department (e.g. Administration/Executive)" maxLength={160} required className={inp} />
      <input value={email} onChange={(ev) => setEmail(ev.target.value)} type="email" required placeholder="Director email (required)" className={`${inp} ${e && !emailOk ? 'border-red-300' : ''}`} />
      <button type="submit" disabled={busy || !n || !emailOk} className={`${btn} bg-nublue-600 hover:bg-nublue-700 text-white disabled:opacity-50 justify-center`}>
        <Plus size={13} /> Add
      </button>
    </form>
  )
}

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

  const addDept = (name, director_email) => guard(async () => {
    if (!EMAIL_RE.test((director_email || '').trim())) throw new Error('A director email is required for every department.')
    const sort_order = (depts?.length || 0) + 1
    const { error } = await supabase.from('gc_departments').insert({ name, sort_order, director_email: director_email.trim() })
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
  const saveDirectorEmail = (id, director_email) => guard(async () => { const { error } = await supabase.from('gc_departments').update({ director_email }).eq('id', id); if (error) throw error; load() })
  const renameUnit = (id, name) => guard(async () => { const { error } = await supabase.from('gc_units').update({ name }).eq('id', id); if (error) throw error; load() })
  const saveUnitEmails = (id, patch) => guard(async () => { const { error } = await supabase.from('gc_units').update(patch).eq('id', id); if (error) throw error; load() })
  const saveUnitCode = (id, code) => guard(async () => {
    const { error } = await supabase.from('gc_units').update({ code }).eq('id', id)
    if (error) throw new Error(/gc_units_code_uq|duplicate key/i.test(error.message) ? `The code ${code} is already used by another unit. Pick a different one.` : error.message)
    load()
  })
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
                  {!d.director_email && (
                    <span title="Director email required" className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5 shrink-0">
                      <AlertTriangle size={10} /> Director email required
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 shrink-0">{deptUnits.length} unit{deptUnits.length !== 1 ? 's' : ''}</span>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/60 space-y-3">
                    <DirectorEmail dept={d} busy={busy} onSave={(v) => saveDirectorEmail(d.id, v)} />
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
                            {u.code && <span title="Unit code" className="font-mono text-[10px] font-bold text-nublue-700 bg-nublue-50 border border-nublue-100 rounded-full px-1.5 py-0.5 shrink-0">{u.code}</span>}
                            {!u.email && !u.head_email && (
                              <span title="No email on file" className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0">
                                <AlertTriangle size={10} /> No email
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 shrink-0">{unitConcerns.length}</span>
                          </div>

                          {uOpen && (
                            <div className="border-t border-slate-100 px-3 py-2.5 space-y-1.5">
                              <UnitCode unit={u} busy={busy} onSave={(code) => saveUnitCode(u.id, code)} />
                              <UnitEmails unit={u} busy={busy} onSave={(patch) => saveUnitEmails(u.id, patch)} />
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
          <AddDepartment busy={busy} onAdd={addDept} />
        </div>
      </div>
    </div>
  )
}
