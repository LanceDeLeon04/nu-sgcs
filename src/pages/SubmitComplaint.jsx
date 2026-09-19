import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { EyeOff, Paperclip, X, Send, Loader2, CheckCircle2, Copy, Check, AlertTriangle, ShieldCheck } from 'lucide-react'
import PublicShell from '../components/PublicShell.jsx'
import { supabase, EVIDENCE_BUCKET } from '../supabaseClient'
import { CATEGORIES, YEAR_LEVELS } from '../lib/constants.js'

const MAX_FILES = 3
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const input = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nublue-500 bg-white'
const label = 'text-xs font-semibold text-slate-500 uppercase tracking-wide'

const empty = {
  is_anonymous: false, complainant_name: '', student_id: '', email: '', contact_no: '', program: '', year_level: '',
  category: '', subject: '', description: '', incident_date: '', incident_location: '', respondent: '', desired_outcome: '',
  website: '', // honeypot — real users never see or fill this
}

const safeName = (n) => n.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)

export default function SubmitComplaint() {
  const [f, setF] = useState(empty)
  const [files, setFiles] = useState([])
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState(null)
  const [copied, setCopied] = useState(false)

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const today = new Date().toISOString().slice(0, 10)

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    setError('')
    const next = [...files]
    for (const file of picked) {
      if (next.length >= MAX_FILES) { setError(`You can attach up to ${MAX_FILES} files.`); break }
      if (!ALLOWED.includes(file.type)) { setError('Only JPG, PNG, WebP images and PDF files are allowed.'); continue }
      if (file.size > MAX_BYTES) { setError(`"${file.name}" is larger than 5 MB.`); continue }
      next.push(file)
    }
    setFiles(next)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (f.website) return // bot
    if (!f.category) return setError('Please choose a category.')
    if (f.subject.trim().length < 5) return setError('Please enter a subject (at least 5 characters).')
    if (f.description.trim().length < 20) return setError('Please describe your concern in at least 20 characters.')
    if (!f.is_anonymous) {
      if (!f.complainant_name.trim()) return setError('Please enter your name, or choose to submit anonymously.')
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return setError('Please enter a valid email address.')
    }
    if (!agree) return setError('Please confirm the statement at the bottom of the form.')

    setBusy(true)
    try {
      const sid = crypto.randomUUID()
      const attachments = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = `submissions/${sid}/${i + 1}-${safeName(file.name)}`
        const { error: upErr } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
        if (upErr) throw new Error(`Could not upload "${file.name}": ${upErr.message}`)
        attachments.push({ path, name: file.name, type: file.type, size: file.size })
      }

      const payload = { ...f, submission_id: sid, attachments }
      delete payload.website
      if (payload.incident_date === '') delete payload.incident_date

      const { data, error: rpcErr } = await supabase.rpc('gc_submit_complaint', { p: payload })
      if (rpcErr) throw new Error(rpcErr.message)
      setCode(data)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  // ---------- Success screen ----------
  if (code) {
    return (
      <PublicShell>
        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle2 className="text-emerald-500" size={30} />
          </div>
          <h1 className="text-xl font-extrabold text-slate-800">Your complaint has been received</h1>
          <p className="text-sm text-slate-500 mt-1">Save your tracking code. You will need it to check progress and respond to the Council.</p>

          <div className="mt-6 inline-flex items-center gap-3 bg-nublue-50 border border-nublue-100 rounded-2xl px-6 py-4">
            <span className="font-mono text-2xl sm:text-3xl font-extrabold text-nublue-700 tracking-wider">{code}</span>
            <button onClick={copy} className="text-nublue-600 hover:text-nublue-800 p-2 rounded-lg hover:bg-white transition" title="Copy code">
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>

          <div className="mt-5 flex items-start gap-2 text-left bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-md mx-auto">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              This code cannot be recovered{f.is_anonymous ? ', especially because you filed anonymously' : ''}. Screenshot it or write it down now.
            </p>
          </div>

          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to={`/track/${code}`} className="bg-nublue-600 hover:bg-nublue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-glow transition">
              Track this complaint
            </Link>
            <Link to="/" className="text-sm font-semibold text-slate-500 hover:text-nublue-700 px-5 py-2.5 rounded-xl hover:bg-nublue-50 transition">
              Back to home
            </Link>
          </div>
        </div>
      </PublicShell>
    )
  }

  // ---------- Form ----------
  return (
    <PublicShell>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-nublue-700 gold-underline inline-block">File a Complaint</h1>
        <p className="text-sm text-slate-500 mt-3">Tell us what happened. Fields marked <span className="text-red-500">*</span> are required.</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* honeypot */}
        <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off"
          className="absolute left-[-9999px] w-px h-px opacity-0" aria-hidden="true" />

        {/* Identity */}
        <section className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6">
          <h2 className="font-bold text-slate-800 mb-3">1. Who is filing?</h2>

          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition ${f.is_anonymous ? 'border-nugold-400 bg-nugold-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="checkbox" checked={f.is_anonymous} onChange={(e) => setF((p) => ({ ...p, is_anonymous: e.target.checked }))} className="mt-1 accent-[#0033A0]" />
            <div>
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><EyeOff size={15} className="text-nublue-600" /> Submit anonymously</p>
              <p className="text-xs text-slate-500 mt-0.5">No name, email or student ID is stored. The Council cannot contact you — you can only follow up through your tracking code.</p>
            </div>
          </label>

          {!f.is_anonymous && (
            <div className="grid sm:grid-cols-2 gap-4 mt-4 animate-fade-in">
              <div><label className={label}>Full name <span className="text-red-500">*</span></label>
                <input className={`${input} mt-1`} value={f.complainant_name} onChange={set('complainant_name')} maxLength={150} /></div>
              <div><label className={label}>Email <span className="text-red-500">*</span></label>
                <input type="email" className={`${input} mt-1`} value={f.email} onChange={set('email')} maxLength={200} /></div>
              <div><label className={label}>Student ID</label>
                <input className={`${input} mt-1`} value={f.student_id} onChange={set('student_id')} maxLength={50} /></div>
              <div><label className={label}>Contact number</label>
                <input className={`${input} mt-1`} value={f.contact_no} onChange={set('contact_no')} maxLength={50} /></div>
              <div><label className={label}>Program / Course</label>
                <input className={`${input} mt-1`} value={f.program} onChange={set('program')} maxLength={150} /></div>
              <div><label className={label}>Year level</label>
                <select className={`${input} mt-1`} value={f.year_level} onChange={set('year_level')}>
                  <option value="">Select…</option>
                  {YEAR_LEVELS.map((y) => <option key={y}>{y}</option>)}
                </select></div>
              <p className="sm:col-span-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck size={12} /> Your details are visible only to authorized Council staff handling complaints.
              </p>
            </div>
          )}
        </section>

        {/* Complaint */}
        <section className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6 space-y-4">
          <h2 className="font-bold text-slate-800">2. What is your concern?</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className={label}>Category <span className="text-red-500">*</span></label>
              <select className={`${input} mt-1`} value={f.category} onChange={set('category')}>
                <option value="">Select a category…</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label className={label}>Date of incident</label>
              <input type="date" max={today} className={`${input} mt-1`} value={f.incident_date} onChange={set('incident_date')} /></div>
          </div>
          <div><label className={label}>Subject <span className="text-red-500">*</span></label>
            <input className={`${input} mt-1`} value={f.subject} onChange={set('subject')} maxLength={200} placeholder="A short title for your concern" /></div>
          <div><label className={label}>Description <span className="text-red-500">*</span></label>
            <textarea rows={6} className={`${input} mt-1 resize-y`} value={f.description} onChange={set('description')} maxLength={5000}
              placeholder="What happened? When and where? Who was involved? Include as much detail as you can." />
            <p className="text-[11px] text-slate-400 mt-1 text-right">{f.description.length}/5000</p></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className={label}>Where did it happen?</label>
              <input className={`${input} mt-1`} value={f.incident_location} onChange={set('incident_location')} maxLength={200} placeholder="Office, room, organization, online…" /></div>
            <div><label className={label}>Person / office concerned</label>
              <input className={`${input} mt-1`} value={f.respondent} onChange={set('respondent')} maxLength={200} placeholder="Who is this complaint about?" /></div>
          </div>
          <div><label className={label}>What outcome would you like?</label>
            <textarea rows={2} className={`${input} mt-1 resize-y`} value={f.desired_outcome} onChange={set('desired_outcome')} maxLength={1000} placeholder="Optional" /></div>
        </section>

        {/* Evidence */}
        <section className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6">
          <h2 className="font-bold text-slate-800 mb-1">3. Evidence <span className="text-xs font-medium text-slate-400">(optional)</span></h2>
          <p className="text-xs text-slate-500 mb-3">Up to {MAX_FILES} files · JPG, PNG, WebP or PDF · 5 MB each</p>
          {files.length > 0 && (
            <ul className="space-y-2 mb-3">
              {files.map((file, i) => (
                <li key={i} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0"><Paperclip size={14} className="text-nublue-500 shrink-0" /><span className="truncate">{file.name}</span>
                    <span className="text-[11px] text-slate-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span></span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500" aria-label="Remove file"><X size={15} /></button>
                </li>
              ))}
            </ul>
          )}
          {files.length < MAX_FILES && (
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-nublue-600 hover:text-nublue-800 bg-nublue-50 hover:bg-nublue-100 rounded-xl px-4 py-2 cursor-pointer transition">
              <Paperclip size={15} /> Add file
              <input type="file" accept={ALLOWED.join(',')} multiple onChange={addFiles} className="hidden" />
            </label>
          )}
        </section>

        {/* Confirm + submit */}
        <section className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-[#0033A0]" />
            <span className="text-sm text-slate-600 leading-relaxed">
              I confirm that the information above is true to the best of my knowledge and that I am submitting this complaint in good faith.
            </span>
          </label>

          {error && <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</div>}

          <button type="submit" disabled={busy}
            className="mt-5 w-full sm:w-auto bg-gradient-to-r from-nublue-600 to-nublue-500 hover:from-nublue-700 hover:to-nublue-600 text-white font-bold px-8 py-3 rounded-xl shadow-glow transition flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <><Loader2 size={17} className="animate-spin" /> Submitting…</> : <><Send size={17} /> Submit Complaint</>}
          </button>
        </section>
      </form>
    </PublicShell>
  )
}
