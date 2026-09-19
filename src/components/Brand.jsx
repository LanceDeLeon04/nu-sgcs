import React from 'react'
import { APP_NAME, APP_SUBTITLE } from '../lib/constants.js'

// COL logo (it already spells out "Council of Leaders") + the system title.
//   variant="row"   -> logo beside the title (page headers)
//   variant="stack" -> logo above the title (sidebar)
//   variant="hero"  -> big stacked version for dark hero/login cards
export default function Brand({ variant = 'row' }) {
  if (variant === 'hero') {
    return (
      <div className="min-w-0">
        <img src="/COLLogo.png" alt={APP_NAME} className="w-44 sm:w-56 h-auto object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.45)]" />
        <p className="text-sm sm:text-base font-bold text-nugold-300 tracking-tight leading-snug mt-2">{APP_SUBTITLE}</p>
      </div>
    )
  }
  if (variant === 'stack') {
    return (
      <div className="min-w-0">
        <img src="/COLLogo.png" alt={APP_NAME} className="w-32 h-auto object-contain" />
        <p className="text-[11px] font-semibold text-slate-500 leading-tight mt-2">{APP_SUBTITLE}</p>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 min-w-0">
      <img src="/COLLogo.png" alt={APP_NAME} className="h-11 w-auto object-contain flex-shrink-0" />
      <div className="hidden sm:block w-px h-8 bg-slate-200" />
      <p className="hidden sm:block text-[11px] font-semibold text-slate-500 leading-tight max-w-[9rem]">{APP_SUBTITLE}</p>
    </div>
  )
}
