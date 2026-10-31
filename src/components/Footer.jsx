import React from 'react'
import { Link } from 'react-router-dom'

// Credit footer with the SCS and COL logos side by side. `tone="light"` is for dark/blue backgrounds.
export default function Footer({ tone = 'dark', className = '' }) {
  const light = tone === 'light'
  return (
    <footer className={`flex flex-col items-center gap-2 text-center py-5 px-4 ${className}`}>
      <div className="flex items-center justify-center gap-4">
        <img src="/SCSLogo.png" alt="School of Computer Studies - Student Council" className="w-10 h-10 object-contain" />
        <div className={`w-px h-8 ${light ? 'bg-white/25' : 'bg-slate-200'}`} />
        <img src="/COLLogo.png" alt="NU Laguna Council of Leaders" className="h-10 w-auto object-contain" />
      </div>
      <p className={`text-[11px] leading-relaxed ${light ? 'text-white/60' : 'text-slate-400'}`}>
        Developed by the School of Computer Studies - Student Council<br />
        for NU Laguna Council of Leaders<br />
        <span className={light ? 'text-white/45' : 'text-slate-300'}>© 2026</span>
      </p>
      <p className={`text-[11px] flex items-center gap-2 ${light ? 'text-white/60' : 'text-slate-400'}`}>
        <Link to="/terms" target="_blank" className="underline hover:text-nublue-600">Terms and Conditions</Link>
        <span aria-hidden>·</span>
        <Link to="/privacy" target="_blank" className="underline hover:text-nublue-600">Data Privacy</Link>
      </p>
    </footer>
  )
}
