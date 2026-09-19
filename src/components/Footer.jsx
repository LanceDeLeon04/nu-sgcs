import React from 'react'

// Credit footer with the SCS logo. `tone="light"` is for dark/blue backgrounds.
export default function Footer({ tone = 'dark', className = '' }) {
  const light = tone === 'light'
  return (
    <footer className={`flex flex-col items-center gap-2 text-center py-5 px-4 ${className}`}>
      <img src="/SCSLogo.png" alt="School of Computer Studies - Student Council" className="w-10 h-10 object-contain" />
      <p className={`text-[11px] leading-relaxed ${light ? 'text-white/60' : 'text-slate-400'}`}>
        Developed by the School of Computer Studies - Student Council<br />
        for NU Laguna Council of Leaders<br />
        <span className={light ? 'text-white/45' : 'text-slate-300'}>© 2026</span>
      </p>
    </footer>
  )
}
