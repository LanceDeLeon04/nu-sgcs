import React, { useCallback, useEffect, useState } from 'react'
import { UserPlus, ShieldCheck, Loader2, Wand2, Eye, EyeOff, Copy, Check, KeyRound, X } from 'lucide-react'
import Navbar from '../../components/Navbar.jsx'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../lib/auth.jsx'

const inp = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nublue-500 bg-white'
const lbl = 'text-xs font-semibold text-slate-500 uppercase tracking-wide'

// 12 chars, no look-alikes (0/O, 1/l/I)
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export default function Team() {
  const { session } = useAuth()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ login: '', password: '', full_name: '', position: '', role: 'handler' })
  const [showPw, setShowPw] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [created, setCreated] = useState(null) // { login, password, name }
  const [copied, setCopied] = useState(false)
  const [resetFor, setResetFor] = useState(null) // user_id being reset
  const [resetPw, setResetPw] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('gc_staff').select('*').order('created_at')
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const create = async (e) => {
    e.preventDefault()
    setMsg(null); setCreated(null); setBusy(true)
    const { data, error } = await supabase.rpc('gc_create_staff_account', {
      p_login: form.login, p_password: form.password, p_full_name: form.full_name, p_position: form.position, p_role: form.role,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: error.message })
    if (data?.created) {
      const username = data.login.endsWith('@col.local') ? data.login.replace('@col.local', '') : data.login
      setCreated({ login: username, password: form.password, name: form.full_name })
    } else {
      setMsg({ type: 'success', text: `${form.full_name} already had a login (${data?.login}), so it was linked to the complaints system. Their password was not changed.` })
    }
    setForm({ login: '', password: '', full_name: '', position: '', role: 'handler' })
    load()
  }

  const update = async (user_id, patch) => {
    setMsg(null)
    const { error } = await supabase.from('gc_staff').update(patch).eq('user_id', user_id)
    if (error) setMsg({ type: 'error', text: error.message })
    load()
  }

  const doReset = async (user_id, name) => {
    setMsg(null)
    const { error } = await supabase.rpc('gc_set_staff_password', { p_user_id: user_id, p_password: resetPw })
    if (error) return setMsg({ type: 'error', text: error.message })
    setMsg({ type: 'success', text: `Password updated for ${name}. Share it with them securely: ${resetPw}` })
    setResetFor(null); setResetPw('')
  }

  const copyCreds = async () => {
    const text = `Council of Leaders – Student Grievance and Complaints System\nUsername: ${created.login}\nPassword: ${created.password}`
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }

  return (
    <div>
      <Navbar title="Manage Staff" />
      <div className="p-8 grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 card-glow p-6 h-fit">
          <h2 className="font-bold text-slate-800 mb-4">Complaints staff</h2>

          {msg && <div className={`mb-4 text-xs rounded-lg px-3 py-2 border break-words ${msg.type === 'error' ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>{msg.text}</div>}

          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const me = r.user_id === session.user.id
              const shownLogin = r.email?.endsWith('@col.local') ? r.email.replace('@col.local', '') : r.email
              return (
                <li key={r.user_id} className={`py-3 ${r.is_active ? '' : 'opacity-50'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        {r.role === 'admin' && <ShieldCheck size={14} className="text-nugold-500" />}{r.full_name}{me && <span className="text-[10px] text-slate-400 font-medium">(you)</span>}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{shownLogin} {r.position ? `· ${r.position}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select disabled={me} value={r.role} onChange={(e) => update(r.user_id, { role: e.target.value })}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white disabled:opacity-60">
                        <option value="handler">Handler</option>
                        <option value="admin">Admin</option>
                      </select>
                      {!me && (
                        <button onClick={() => { setResetFor(resetFor === r.user_id ? null : r.user_id); setResetPw(generatePassword()) }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition flex items-center gap-1">
                          <KeyRound size={12} /> Reset password
                        </button>
                      )}
                      <button disabled={me} onClick={() => update(r.user_id, { is_active: !r.is_active })}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition disabled:opacity-40 ${r.is_active ? 'text-red-500 border-red-200 hover:bg-red-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>
                        {r.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </div>

                  {resetFor === r.user_id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <input value={resetPw} onChange={(e) => setResetPw(e.target.value)} className={`${inp} font-mono flex-1 min-w-[180px]`} />
                      <button type="button" onClick={() => setResetPw(generatePassword())} className="text-xs font-semibold text-nublue-600 hover:text-nublue-800 flex items-center gap-1"><Wand2 size={12} /> Generate</button>
                      <button onClick={() => doReset(r.user_id, r.full_name)} className="text-xs font-semibold bg-nublue-600 hover:bg-nublue-700 text-white px-3 py-1.5 rounded-lg transition">Set password</button>
                      <button onClick={() => setResetFor(null)} className="text-slate-400 hover:text-slate-600" aria-label="Cancel"><X size={15} /></button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="space-y-5 h-fit">
          <form onSubmit={create} className="bg-white rounded-2xl border border-slate-100 card-glow p-6 space-y-3">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><UserPlus size={17} className="text-nublue-600" /> Create account</h2>
            <p className="text-xs text-slate-400">Creates the login and gives it access in one step. Use a username (e.g. <span className="font-mono">grace.officer</span>) or a real email.</p>
            <div><label className={lbl}>Username or email</label><input required className={`${inp} mt-1`} autoCapitalize="none" spellCheck={false} value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} /></div>
            <div><label className={lbl}>Full name</label><input required className={`${inp} mt-1`} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label className={lbl}>Position</label><input className={`${inp} mt-1`} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
            <div><label className={lbl}>Role</label>
              <select className={`${inp} mt-1`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="handler">Handler — review, respond, assign</option>
                <option value="admin">Admin — also delete, manage staff</option>
              </select></div>
            <div>
              <div className="flex items-center justify-between">
                <label className={lbl}>Password</label>
                <button type="button" onClick={() => { setForm({ ...form, password: generatePassword() }); setShowPw(true) }} className="text-[11px] font-semibold text-nublue-600 hover:text-nublue-800 flex items-center gap-1"><Wand2 size={11} /> Generate</button>
              </div>
              <div className="relative mt-1">
                <input type={showPw ? 'text' : 'password'} minLength={8} className={`${inp} pr-9 font-mono`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Toggle password visibility">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Leave blank only if this person already has a login (e.g. an SCS account) — it will be linked and their password kept.</p>
            </div>
            <button disabled={busy} className="w-full bg-nublue-600 hover:bg-nublue-700 text-white font-semibold text-sm py-2.5 rounded-xl shadow-glow transition flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 size={14} className="animate-spin" />} Create account
            </button>
          </form>

          {created && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
              <p className="text-sm font-bold text-emerald-800">Account created for {created.name}</p>
              <p className="text-xs text-emerald-700 mt-1">Share these with them securely. The password won't be shown again.</p>
              <div className="mt-3 bg-white border border-emerald-100 rounded-xl px-3 py-2 font-mono text-sm text-slate-700 space-y-0.5 break-all">
                <p><span className="text-slate-400">Username: </span>{created.login}</p>
                <p><span className="text-slate-400">Password: </span>{created.password}</p>
              </div>
              <button onClick={copyCreds} className="mt-3 text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1.5">
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
