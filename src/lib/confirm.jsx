import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Send, HelpCircle } from 'lucide-react'

// In-app replacement for window.confirm(). Usage:
//   const confirm = useConfirm()
//   if (!(await confirm({ title, message, confirmText, tone: 'danger' | 'primary' }))) return
const ConfirmContext = createContext(() => Promise.resolve(false))

export function ConfirmProvider({ children }) {
  const [dlg, setDlg] = useState(null)
  const resolver = useRef(null)
  const okRef = useRef(null)

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolver.current = resolve
    setDlg(typeof opts === 'string' ? { message: opts } : opts)
  }), [])

  const close = (val) => { resolver.current?.(val); resolver.current = null; setDlg(null) }

  useEffect(() => {
    if (!dlg) return
    okRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dlg])

  const danger = dlg?.tone === 'danger'
  const Icon = danger ? AlertTriangle : dlg?.tone === 'primary' ? Send : HelpCircle

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dlg && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-nublue-900/40 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false) }}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-6">
            <div className="flex items-start gap-3">
              <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${danger ? 'bg-red-50 text-red-600' : 'bg-nublue-50 text-nublue-700'}`}><Icon size={20} /></span>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-nublue-900">{dlg.title || (danger ? 'Are you sure?' : 'Please confirm')}</h3>
                <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-line leading-relaxed">{dlg.message}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => close(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200">{dlg.cancelText || 'Cancel'}</button>
              <button ref={okRef} onClick={() => close(true)}
                className={`px-4 py-2 rounded-xl text-sm font-bold ${danger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-nublue-700 hover:bg-nublue-600 text-white'}`}>
                {dlg.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)
