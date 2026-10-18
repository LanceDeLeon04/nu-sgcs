import React from 'react'
import { APP_NAME, APP_SUBTITLE } from '../lib/constants.js'

// NUplift logo + the system title.
//   variant="row"   -> logo beside the title (page headers)
//   variant="stack" -> logo above the title (sidebar)
//   variant="hero"  -> larger version for the dark hero/login cards (original-color logo; its built-in white outline
//                      keeps it readable on dark backgrounds, no backing plate)
export default function Brand({ variant = 'row' }) {
  if (variant === 'hero') {
    return (
      <div className="min-w-0">
        <img src="/NUpliftLogo.png" alt={APP_NAME} className="w-60 sm:w-80 max-w-full h-auto object-contain block drop-shadow-[0_6px_18px_rgba(0,0,0,0.35)]" />
        <p className="text-sm sm:text-base font-bold text-nugold-300 tracking-tight leading-snug mt-1.5">{APP_SUBTITLE}</p>
      </div>
    )
  }
  if (variant === 'stack') {
    return (
      <div className="min-w-0">
        <img src="/NUpliftLogo.png" alt={APP_NAME} className="w-36 h-auto object-contain" />
        <p className="text-[11px] font-semibold text-slate-500 leading-tight mt-2">{APP_SUBTITLE}</p>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 min-w-0">
      <img src="/NUpliftLogo.png" alt={APP_NAME} className="h-11 w-auto object-contain flex-shrink-0" />
      <div className="hidden sm:block w-px h-8 bg-slate-200" />
      <p className="hidden sm:block text-[11px] font-semibold text-slate-500 leading-tight max-w-[9rem]">{APP_SUBTITLE}</p>
    </div>
  )
}
