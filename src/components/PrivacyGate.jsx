import React, { useState } from 'react'
import { ShieldCheck, Check, X } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { TermsLink, PrivacyLink } from './LegalLinks.jsx'
import { APP_NAME } from '../lib/constants.js'

// Shown after EVERY staff sign-in. Agree -> continue. Disagree -> signed straight back out.
export default function PrivacyGate() {
  const { acceptPrivacy, signOut } = useAuth()
  const [ticked, setTicked] = useState(false)
  const link = 'font-bold underline text-nugold-300 hover:text-nugold-200'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-nublue-900/90 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="pg-title">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="h-1 bg-gradient-to-r from-nugold-500 via-nugold-300 to-transparent" />
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-nublue-50 flex items-center justify-center"><ShieldCheck className="text-nublue-600" size={22} /></div>
            <div>
              <h2 id="pg-title" className="font-extrabold text-nublue-700 text-lg leading-tight">Terms and Data Privacy</h2>
              <p className="text-xs text-slate-400">Please review before using {APP_NAME}</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed mt-4">
            As staff you will see students' personal information and concerns. Under the Data Privacy Act of 2012 (RA 10173), you must
            use it only to handle the cases assigned to you, keep it confidential, and never share it outside official channels.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed mt-2">
            Read the <TermsLink className={link.replace('text-nugold-300 hover:text-nugold-200', 'text-nublue-600 hover:text-nublue-800')} /> and
            the <PrivacyLink className={link.replace('text-nugold-300 hover:text-nugold-200', 'text-nublue-600 hover:text-nublue-800')} /> (each opens in a new tab).
          </p>

          <label className="flex items-start gap-3 mt-4 cursor-pointer bg-slate-50 border border-slate-100 rounded-xl p-3">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-1 accent-[#0033A0]" />
            <span className="text-sm text-slate-700 leading-relaxed">
              I have read and agree to the Terms and Conditions and the Data Privacy Notice.
            </span>
          </label>

          <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button onClick={signOut}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition">
              <X size={15} /> Disagree
            </button>
            <button onClick={acceptPrivacy} disabled={!ticked}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-nublue-600 to-nublue-500 hover:from-nublue-700 hover:to-nublue-600 shadow-glow transition disabled:opacity-40 disabled:cursor-not-allowed">
              <Check size={15} /> Agree
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-3 text-right">Choosing Disagree signs you out.</p>
        </div>
      </div>
    </div>
  )
}
