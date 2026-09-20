import React from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, Search, LogIn, EyeOff, KeyRound, ShieldCheck, ClipboardCheck, MessagesSquare, BadgeCheck, GraduationCap, MessageSquareText, FileWarning } from 'lucide-react'
import Brand from '../components/Brand.jsx'
import Footer from '../components/Footer.jsx'
import ChatWidget from '../components/ChatWidget.jsx'
import { APP_NAME, COMPLAINT_NOTICE } from '../lib/constants.js'
import { FeedbackNoticeText } from '../components/NoticeText.jsx'

const steps = [
  { icon: ClipboardCheck, title: 'Submit', text: 'Describe your concern, identify yourself and attach evidence.' },
  { icon: KeyRound, title: 'Get your tracking code', text: 'You receive a private code the moment you submit. Keep it safe.' },
  { icon: MessagesSquare, title: 'Council review', text: 'The Council reviews your case; a representative may reach out via Teams to confirm details.' },
  { icon: BadgeCheck, title: 'Resolution', text: 'You are told the outcome and can rate how your concern was handled.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#f5f8ff]">
      {/* Hero — same blueprint artwork + glass styling as the council portal login */}
      <section
        className="relative overflow-hidden bg-nublue-900 bg-cover bg-center"
        style={{ backgroundImage: "url('/LogInBG.png')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-nublue-900/95 via-nublue-900/75 to-nublue-900/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-nublue-900/60 via-transparent to-nublue-900/40" />
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-nugold-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-nublue-400/20 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 pt-5 pb-16 sm:pb-24">
          <div className="flex items-center justify-between">
            <span className="text-white/0 select-none w-0">.</span>
            <Link to="/staff/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/15 border border-white/25 rounded-full px-3.5 py-1.5 backdrop-blur transition">
              <LogIn size={13} /> Staff Login
            </Link>
          </div>

          <div className="mt-6 sm:mt-10 max-w-xl animate-fade-in">
            <div className="bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/25 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] p-6 sm:p-8 relative overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/20 to-transparent rounded-t-3xl" />
              <div className="pointer-events-none absolute -top-1 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-nugold-400/80 to-transparent" />

              <div className="relative inline-flex items-center gap-1.5 bg-nugold-400/10 border border-nugold-400/30 rounded-full px-2.5 py-0.5 mb-4">
                <GraduationCap size={11} className="text-nugold-300" />
                <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-nugold-300">Your voice matters</span>
              </div>

              <div className="relative mb-4">
                <Brand variant="hero" />
                <div className="h-[3px] w-14 bg-gradient-to-r from-nugold-400 to-nugold-400/0 rounded-full mt-3" />
              </div>

              <p className="relative text-sm text-white/75 leading-relaxed mb-6">
                Share feedback with the Council, or file a formal complaint when you need an actual resolution.
                Every submission is reviewed by the {APP_NAME}.
              </p>

              <div className="relative flex flex-col sm:flex-row gap-3">
                <Link to="/submit/complaint"
                  className="flex-1 bg-gradient-to-r from-nugold-400 to-nugold-500 hover:from-nugold-300 hover:to-nugold-400 text-nublue-900 font-bold py-2.5 rounded-xl transition shadow-[0_8px_20px_-6px_rgba(255,199,44,0.5)] flex items-center justify-center gap-2">
                  <FileWarning size={17} /> File a Complaint
                </Link>
                <Link to="/submit/feedback"
                  className="flex-1 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2">
                  <MessageSquareText size={17} /> Give Feedback
                </Link>
              </div>
              <Link to="/track" className="relative mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition">
                <Search size={15} /> Track a complaint with your code
              </Link>

              <div className="relative flex items-center gap-2 mt-5 bg-white/5 border border-white/15 rounded-xl px-3 py-2">
                <EyeOff size={14} className="text-nugold-300 flex-shrink-0" />
                <p className="text-[11px] text-white/65 leading-snug">
                  Want to stay anonymous? Send Feedback. Formal complaints require identification.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feedback vs Complaint */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pt-12">
        <div className="text-center mb-8">
          <h2 className="text-xl font-extrabold text-nublue-700 gold-underline inline-block">Feedback or Complaint?</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-nugold-100 text-nugold-700 flex items-center justify-center"><MessageSquareText size={20} /></div>
              <div>
                <p className="font-extrabold text-slate-800">Feedback</p>
                <p className="text-[11px] font-semibold text-nublue-600 flex items-center gap-1"><EyeOff size={11} /> Anonymous option</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed"><FeedbackNoticeText /></p>
            <Link to="/submit/feedback" className="inline-block mt-4 text-sm font-bold text-nublue-600 hover:text-nublue-800">Give feedback →</Link>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-nublue-600 text-white flex items-center justify-center shadow-glow"><FileWarning size={20} /></div>
              <div>
                <p className="font-extrabold text-slate-800">Formal Complaint</p>
                <p className="text-[11px] font-semibold text-nublue-600 flex items-center gap-1"><ShieldCheck size={11} /> Identification required · Trackable</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{COMPLAINT_NOTICE}</p>
            <Link to="/submit/complaint" className="inline-block mt-4 text-sm font-bold text-nublue-600 hover:text-nublue-800">File a complaint →</Link>
          </div>
        </div>
      </section>

      {/* How a complaint works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
        <div className="text-center mb-8">
          <h2 className="text-xl font-extrabold text-nublue-700 gold-underline inline-block">How a formal complaint works</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <div key={s.title} className="bg-white rounded-2xl border border-slate-100 card-glow p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-nublue-600 text-white flex items-center justify-center shadow-glow">
                  <s.icon size={19} />
                </div>
                <span className="text-3xl font-extrabold text-nugold-400/70">{i + 1}</span>
              </div>
              <p className="font-bold text-slate-800 text-sm">{s.title}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-white rounded-2xl border border-slate-100 card-glow p-6 flex items-start gap-3">
          <ShieldCheck size={22} className="text-nublue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-800 text-sm">Fair, confidential and good-faith</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Complaints are visible only to authorized Council of Leaders staff. Please submit truthful information only.
              For emergencies or threats to anyone's safety, contact campus security or local authorities immediately —
              this system is not monitored in real time.
            </p>
          </div>
        </div>
      </section>

      <Footer className="border-t border-slate-100 bg-white" />
      <ChatWidget />
    </div>
  )
}
