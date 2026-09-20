import React, { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  EyeOff, Paperclip, X, Send, Loader2, CheckCircle2, Copy, Check, AlertTriangle, ShieldCheck,
  MessageSquareText, FileWarning, Info, Users, ArrowRight,
} from 'lucide-react'
import PublicShell from '../components/PublicShell.jsx'
import { supabase, EVIDENCE_BUCKET } from '../supabaseClient'
import {
  CATEGORIES, FEEDBACK_CATEGORIES, YEAR_LEVELS, COMPLAINT_NOTICE, subcategoriesOf, groupOf,
  formatStudentId, isValidStudentId, isValidNuEmail, STUDENT_ID_HINT, NU_EMAIL_DOMAIN,
} from '../lib/constants.js'
import { FeedbackNoticeText, Highlight } from '../components/NoticeText.jsx'
import { hasProfanityIn } from '../lib/profanity.js'

const MAX_FILES = 3
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const input = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nublue-500 bg-white'
const label = 'text-xs font-semibold text-slate-500 uppercase tracking-wide'
const safeName = (n) => n.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)

/* ------------------------------------------------------------------ */
/* Step 0: choose Feedback or Complaint                                */
/* ------------------------------------------------------------------ */
export function TypeChooser() {
  return (
    <PublicShell wide>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold text-nublue-700 gold-underline inline-block">What would you like to submit?</h1>
        <p className="text-sm text-slate-500 mt-3">Choose the option that fits what you need.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6 flex flex-col">
          <div className="w-11 h-11 rounded-xl bg-nugold-100 text-nugold-700 flex items-center justify-center mb-4"><MessageSquareText size={22} /></div>
          <h2 className="text-lg font-extrabold text-slate-800">Feedback</h2>
          <span className="inline-flex items-center gap-1 self-start text-[11px] font-bold text-nublue-700 bg-nublue-50 border border-nublue-100 rounded-full px-2 py-0.5 mt-2">
            <EyeOff size={11} /> You can stay anonymous
          </span>
          <p className="text-sm text-slate-600 mt-4 leading-relaxed"><FeedbackNoticeText /></p>
          <ul className="text-xs text-slate-500 mt-4 space-y-1.5">
            <li>• Suggestions, compliments and general concerns</li>
            <li>• Filed and forwarded to the concerned office(s)</li>
            <li>• No tracking code and no resolution process</li>
          </ul>
          <Link to="/submit/feedback"
            className="mt-6 inline-flex items-center justify-center gap-2 bg-nugold-500 hover:bg-nugold-400 text-nublue-900 font-bold text-sm py-2.5 rounded-xl transition">
            Give Feedback <ArrowRight size={15} />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6 flex flex-col">
          <div className="w-11 h-11 rounded-xl bg-nublue-600 text-white flex items-center justify-center mb-4 shadow-glow"><FileWarning size={22} /></div>
          <h2 className="text-lg font-extrabold text-slate-800">Formal Complaint</h2>
          <span className="inline-flex items-center gap-1 self-start text-[11px] font-bold text-nublue-700 bg-nublue-50 border border-nublue-100 rounded-full px-2 py-0.5 mt-2">
            <ShieldCheck size={11} /> Identification required · Trackable
          </span>
          <p className="text-sm text-slate-600 mt-4 leading-relaxed">{COMPLAINT_NOTICE}</p>
          <ul className="text-xs text-slate-500 mt-4 space-y-1.5">
            <li>• Actual resolution and trackable actions</li>
            <li>• Your name, student ID and email are required</li>
            <li>• Attach evidence and follow progress with your tracking code</li>
          </ul>
          <Link to="/submit/complaint"
            className="mt-6 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-nublue-600 to-nublue-500 hover:from-nublue-700 hover:to-nublue-600 text-white font-bold text-sm py-2.5 rounded-xl shadow-glow transition">
            File a Complaint <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </PublicShell>
  )
}

/* ------------------------------------------------------------------ */
/* The form (feedback or complaint)                                    */
/* ------------------------------------------------------------------ */
const blank = {
  is_anonymous: false, complainant_name: '', student_id: '', email: '', contact_no: '', program: '', year_level: '',
  category: '', subcategory: '', subject: '', description: '', incident_date: '', incident_location: '', respondent: '', desired_outcome: '',
  website: '', // honeypot
}

function SubmitForm({ type }) {
  const isComplaint = type === 'complaint'
  const [f, setF] = useState(blank)
  const [files, setFiles] = useState([])
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // tracking code (complaint) or reference (feedback)
  const [copied, setCopied] = useState(false)

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const setCategory = (e) => setF((p) => ({ ...p, category: e.target.value, subcategory: '' }))
  const setStudentId = (e) => setF((p) => ({ ...p, student_id: formatStudentId(e.target.value) }))
  const today = new Date().toISOString().slice(0, 10)
  const anon = !isComplaint && f.is_anonymous
  const cats = isComplaint ? CATEGORIES : FEEDBACK_CATEGORIES
  const minDesc = isComplaint ? 20 : 10
  const subs = isComplaint ? subcategoriesOf(f.category) : []
  const group = isComplaint ? groupOf(f.category) : null
  // Feedback: strong language is blocked. Complaints: allowed (people may need to quote what was said) but flagged for staff.
  const strongLanguage = useMemo(
    () => hasProfanityIn(f.subject, f.description, f.respondent, f.desired_outcome),
    [f.subject, f.description, f.respondent, f.desired_outcome],
  )

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
    if (isComplaint && !f.subcategory) return setError('Please choose a sub-category.')
    if (f.subject.trim().length < 5) return setError('Please enter a subject (at least 5 characters).')
    if (f.description.trim().length < minDesc) return setError(`Please write at least ${minDesc} characters in the description.`)
    if (!anon && !f.complainant_name.trim()) return setError(isComplaint ? 'Please enter your full name.' : 'Please enter your name, or send the feedback anonymously.')
    if (isComplaint) {
      if (!isValidStudentId(f.student_id)) return setError(`Please enter your student ID in this format: ${STUDENT_ID_HINT}.`)
      if (!isValidNuEmail(f.email)) return setError(`Please use your NU student email (@${NU_EMAIL_DOMAIN}).`)
    } else if (!anon) {
      if (f.student_id.trim() && !isValidStudentId(f.student_id)) return setError(`Student ID must follow this format: ${STUDENT_ID_HINT}.`)
      if (f.email.trim() && !isValidNuEmail(f.email)) return setError(`Please use your NU student email (@${NU_EMAIL_DOMAIN}), or leave it blank.`)
    }
    if (!isComplaint && strongLanguage) return setError('Your message contains language that is not allowed. Please rephrase it respectfully and try again.')
    if (!agree) return setError('Please confirm the statement at the bottom of the form.')

    setBusy(true)
    try {
      let data, rpcErr
      if (isComplaint) {
        const sid = crypto.randomUUID()
        const attachments = []
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const path = `submissions/${sid}/${i + 1}-${safeName(file.name)}`
          const { error: upErr } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
          if (upErr) throw new Error(`Could not upload "${file.name}": ${upErr.message}`)
          attachments.push({ path, name: file.name, type: file.type, size: file.size })
        }
        const payload = { ...f, is_anonymous: false, submission_id: sid, attachments }
        delete payload.website
        if (payload.incident_date === '') delete payload.incident_date
        ;({ data, error: rpcErr } = await supabase.rpc('gc_submit_complaint', { p: payload }))
      } else {
        const payload = {
          is_anonymous: f.is_anonymous, complainant_name: f.complainant_name, email: f.email, student_id: f.student_id,
          program: f.program, year_level: f.year_level, category: f.category, subject: f.subject,
          description: f.description, respondent: f.respondent,
        }
        ;({ data, error: rpcErr } = await supabase.rpc('gc_submit_feedback', { p: payload }))
      }
      if (rpcErr) throw new Error(rpcErr.message)
      setResult(data)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  /* ---------- success screens ---------- */
  if (result && isComplaint) {
    return (
      <PublicShell>
        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4"><CheckCircle2 className="text-emerald-500" size={30} /></div>
          <h1 className="text-xl font-extrabold text-slate-800">Your complaint has been received</h1>
          <p className="text-sm text-slate-500 mt-1">Save your tracking code. You'll need it to follow every action taken.</p>
          <div className="mt-6 inline-flex items-center gap-3 bg-nublue-50 border border-nublue-100 rounded-2xl px-6 py-4">
            <span className="font-mono text-2xl sm:text-3xl font-extrabold text-nublue-700 tracking-wider">{result}</span>
            <button onClick={copy} className="text-nublue-600 hover:text-nublue-800 p-2 rounded-lg hover:bg-white transition" title="Copy code">
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <div className="mt-5 flex items-start gap-2 text-left bg-nublue-50 border border-nublue-100 rounded-xl px-4 py-3 max-w-md mx-auto">
            <Users size={16} className="text-nublue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-nublue-800 leading-relaxed">A representative may contact you via <b>Microsoft Teams</b> to confirm the details of your report.</p>
          </div>
          <div className="mt-3 flex items-start gap-2 text-left bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-md mx-auto">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">This code cannot be recovered. Screenshot it or write it down now.</p>
          </div>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to={`/track/${result}`} className="bg-nublue-600 hover:bg-nublue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-glow transition">Track this complaint</Link>
            <Link to="/" className="text-sm font-semibold text-slate-500 hover:text-nublue-700 px-5 py-2.5 rounded-xl hover:bg-nublue-50 transition">Back to home</Link>
          </div>
        </div>
      </PublicShell>
    )
  }
  if (result) {
    return (
      <PublicShell>
        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4"><CheckCircle2 className="text-emerald-500" size={30} /></div>
          <h1 className="text-xl font-extrabold text-slate-800">Thank you for your feedback</h1>
          <p className="text-sm text-slate-500 mt-1">Your feedback has been filed and will be forwarded to the concerned office(s).</p>
          <p className="mt-5 text-xs text-slate-400">Reference for your records</p>
          <p className="font-mono text-xl font-extrabold text-nublue-700 tracking-wider">{result}</p>
          <p className="text-[11px] text-slate-400 mt-1">Feedback can't be tracked and doesn't receive a resolution.</p>
          <div className="mt-5 flex items-start gap-2 text-left bg-nugold-50 border border-nugold-200 rounded-xl px-4 py-3 max-w-md mx-auto">
            <Info size={16} className="text-nugold-700 shrink-0 mt-0.5" />
            <p className="text-xs text-nugold-800 leading-relaxed">Need <Highlight>actual resolutions and trackable actions</Highlight>? <Link to="/submit/complaint" className="font-bold underline">File a formal complaint</Link> instead.</p>
          </div>
          <div className="mt-7"><Link to="/" className="text-sm font-semibold text-nublue-600 hover:text-nublue-800">Back to home</Link></div>
        </div>
      </PublicShell>
    )
  }

  /* ---------- form ---------- */
  return (
    <PublicShell>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-nublue-700 gold-underline inline-block">{isComplaint ? 'File a Formal Complaint' : 'Give Feedback'}</h1>
        <p className="text-sm text-slate-500 mt-3">Fields marked <span className="text-red-500">*</span> are required. <Link to="/submit" className="text-nublue-600 font-semibold hover:underline">Change type</Link></p>
      </div>

      {/* Explicit notice */}
      {isComplaint ? (
        <div className="mb-6 flex items-start gap-3 bg-nublue-50 border border-nublue-100 rounded-2xl px-4 py-3.5">
          <Users size={18} className="text-nublue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-nublue-800">Identification is required</p>
            <p className="text-xs text-nublue-800/80 mt-1 leading-relaxed">{COMPLAINT_NOTICE}</p>
            <p className="text-xs text-nublue-800/80 mt-1">Prefer to stay anonymous? <Link to="/submit/feedback" className="font-bold underline">Send feedback instead</Link>.</p>
          </div>
        </div>
      ) : (
        <div className="mb-6 flex items-start gap-3 bg-nugold-50 border border-nugold-200 rounded-2xl px-4 py-3.5">
          <Info size={18} className="text-nugold-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-nugold-800">Feedback is for filing and reporting only</p>
            <p className="text-xs text-nugold-800/90 mt-1 leading-relaxed"><FeedbackNoticeText /></p>
            <Link to="/submit/complaint" className="inline-block text-xs font-bold text-nugold-800 underline mt-1">File a formal complaint instead →</Link>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off"
          className="absolute left-[-9999px] w-px h-px opacity-0" aria-hidden="true" />

        {/* Identity */}
        <section className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6">
          <h2 className="font-bold text-slate-800 mb-3">1. {isComplaint ? 'Your details' : 'Who is sending this?'}</h2>

          {!isComplaint && (
            <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition ${f.is_anonymous ? 'border-nugold-400 bg-nugold-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="checkbox" checked={f.is_anonymous} onChange={(e) => setF((p) => ({ ...p, is_anonymous: e.target.checked }))} className="mt-1 accent-[#0033A0]" />
              <div>
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><EyeOff size={15} className="text-nublue-600" /> Send anonymously</p>
                <p className="text-xs text-slate-500 mt-0.5">No name, email or student ID is stored.</p>
              </div>
            </label>
          )}

          {!anon && (
            <div className={`grid sm:grid-cols-2 gap-4 animate-fade-in ${!isComplaint ? 'mt-4' : ''}`}>
              <div><label className={label}>Full name <span className="text-red-500">*</span></label>
                <input className={`${input} mt-1`} value={f.complainant_name} onChange={set('complainant_name')} maxLength={150} /></div>
              <div><label className={label}>{isComplaint ? <>NU email (for Teams) <span className="text-red-500">*</span></> : 'Email (optional)'}</label>
                <input type="email" inputMode="email" autoComplete="email" className={`${input} mt-1`} value={f.email} onChange={set('email')} maxLength={200}
                  placeholder={`yourname@${NU_EMAIL_DOMAIN}`} />
                <p className="text-[11px] text-slate-400 mt-1">Only @{NU_EMAIL_DOMAIN} accounts are accepted.</p></div>
              <div><label className={label}>Student ID {isComplaint && <span className="text-red-500">*</span>}</label>
                <input className={`${input} mt-1 font-mono`} value={f.student_id} onChange={setStudentId} maxLength={12} inputMode="numeric"
                  placeholder="20XX-XXXXXXX" autoComplete="off" />
                <p className="text-[11px] text-slate-400 mt-1">Format: 20XX-XXXXXXX (7 digits after the hyphen).</p></div>
              {isComplaint && (
                <div><label className={label}>Contact number</label>
                  <input className={`${input} mt-1`} value={f.contact_no} onChange={set('contact_no')} maxLength={50} /></div>
              )}
              <div><label className={label}>Program / Course</label>
                <input className={`${input} mt-1`} value={f.program} onChange={set('program')} maxLength={150} /></div>
              <div><label className={label}>Year level</label>
                <select className={`${input} mt-1`} value={f.year_level} onChange={set('year_level')}>
                  <option value="">Select…</option>
                  {YEAR_LEVELS.map((y) => <option key={y}>{y}</option>)}
                </select></div>
              <p className="sm:col-span-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck size={12} /> Your details are visible only to authorized Council staff.
              </p>
            </div>
          )}
        </section>

        {/* Content */}
        <section className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6 space-y-4">
          <h2 className="font-bold text-slate-800">2. {isComplaint ? 'What is your concern?' : 'What would you like to tell us?'}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className={label}>Category <span className="text-red-500">*</span></label>
              <select className={`${input} mt-1`} value={f.category} onChange={isComplaint ? setCategory : set('category')}>
                <option value="">Select a category…</option>
                {cats.map((c) => <option key={c}>{c}</option>)}
              </select>
              {group && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{group.description}</p>}</div>
            {isComplaint && (
              <div><label className={label}>Sub-category <span className="text-red-500">*</span></label>
                <select className={`${input} mt-1 disabled:bg-slate-50 disabled:text-slate-400`} value={f.subcategory} onChange={set('subcategory')} disabled={!f.category}>
                  <option value="">{f.category ? 'Select a sub-category…' : 'Choose a category first'}</option>
                  {subs.map((c) => <option key={c}>{c}</option>)}
                </select></div>
            )}
            {isComplaint && (
              <div><label className={label}>Date of incident</label>
                <input type="date" max={today} className={`${input} mt-1`} value={f.incident_date} onChange={set('incident_date')} /></div>
            )}
          </div>
          <div><label className={label}>Subject <span className="text-red-500">*</span></label>
            <input className={`${input} mt-1`} value={f.subject} onChange={set('subject')} maxLength={200} placeholder="A short title" /></div>
          <div><label className={label}>{isComplaint ? 'Description' : 'Your feedback'} <span className="text-red-500">*</span></label>
            <textarea rows={6} className={`${input} mt-1 resize-y`} value={f.description} onChange={set('description')} maxLength={5000}
              placeholder={isComplaint ? 'What happened? When and where? Who was involved? Include as much detail as you can.' : 'Share your suggestion, compliment or concern.'} />
            <p className="text-[11px] text-slate-400 mt-1 text-right">{f.description.length}/5000</p>
            {strongLanguage && (
              <div className={`mt-2 text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isComplaint ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{isComplaint
                  ? 'We noticed strong language. You can still submit, but please keep it respectful. The Council will be notified so staff can review it with care.'
                  : 'Your message contains language that is not allowed. Please rephrase it before sending.'}</span>
              </div>
            )}</div>
          <div className={isComplaint ? 'grid sm:grid-cols-2 gap-4' : ''}>
            {isComplaint && (
              <div><label className={label}>Where did it happen?</label>
                <input className={`${input} mt-1`} value={f.incident_location} onChange={set('incident_location')} maxLength={200} placeholder="Office, room, organization, online…" /></div>
            )}
            <div><label className={label}>{isComplaint ? 'Person / office concerned' : 'Office or person concerned (helps us forward it)'}</label>
              <input className={`${input} mt-1`} value={f.respondent} onChange={set('respondent')} maxLength={200} placeholder={isComplaint ? 'Who is this complaint about?' : 'e.g. Registrar, Library, SCS Student Council'} /></div>
          </div>
          {isComplaint && (
            <div><label className={label}>What outcome would you like?</label>
              <textarea rows={2} className={`${input} mt-1 resize-y`} value={f.desired_outcome} onChange={set('desired_outcome')} maxLength={1000} placeholder="Optional" /></div>
          )}
        </section>

        {/* Evidence (complaints only) */}
        {isComplaint && (
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
        )}

        {/* Confirm + submit */}
        <section className="bg-white rounded-2xl border border-slate-100 card-glow p-5 sm:p-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-[#0033A0]" />
            <span className="text-sm text-slate-600 leading-relaxed">
              {isComplaint
                ? 'I confirm that the information above is true to the best of my knowledge, and I understand that a representative may contact me via Microsoft Teams to confirm the details of this report.'
                : 'I understand that feedback is for filing and reporting only, will be forwarded to the concerned office(s), and will not receive a resolution or trackable actions.'}
            </span>
          </label>

          {error && <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</div>}

          <button type="submit" disabled={busy}
            className="mt-5 w-full sm:w-auto bg-gradient-to-r from-nublue-600 to-nublue-500 hover:from-nublue-700 hover:to-nublue-600 text-white font-bold px-8 py-3 rounded-xl shadow-glow transition flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <><Loader2 size={17} className="animate-spin" /> Submitting…</> : <><Send size={17} /> {isComplaint ? 'Submit Complaint' : 'Submit Feedback'}</>}
          </button>
        </section>
      </form>
    </PublicShell>
  )
}

export default function Submit() {
  const { type } = useParams()
  if (!type) return <TypeChooser />
  if (type !== 'feedback' && type !== 'complaint') return <Navigate to="/submit" replace />
  return <SubmitForm key={type} type={type} />
}
