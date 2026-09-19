import React from 'react'
import { ChevronRight } from 'lucide-react'

export default function Navbar({ title, crumbs = [], onCrumbClick }) {
  return (
    <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-100 px-8 py-4">
      <h1 className="text-lg font-bold text-slate-800 tracking-tight">{title}</h1>
      {crumbs.length > 0 && (
        <div className="flex items-center flex-wrap gap-1 text-xs text-slate-400 mt-1">
          <button
            onClick={() => onCrumbClick && onCrumbClick(-1)}
            className="hover:text-nublue-600 font-medium transition"
          >
            Home
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={12} />
              <button
                onClick={() => onCrumbClick && onCrumbClick(i)}
                className={`hover:text-nublue-600 transition ${i === crumbs.length - 1 ? 'text-nublue-600 font-semibold' : 'font-medium'}`}
              >
                {c}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
