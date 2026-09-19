import React, { useState } from 'react'
import Navbar from '../../components/Navbar.jsx'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../lib/auth.jsx'
import { Lock, KeyRound } from 'lucide-react'

export default function Settings() {
  const { staff, session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg(null)

    if (password.length < 6) {
      setMsg({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }
    if (password !== confirm) {
      setMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMsg({ type: 'success', text: 'Password updated successfully.' })
      setPassword('')
      setConfirm('')
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update password.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Navbar title="Account Settings" />
      <div className="p-8 max-w-md">
        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={18} className="text-nublue-600" />
            <h2 className="font-bold text-slate-800">Change Password</h2>
          </div>
          <p className="text-xs text-slate-400 mb-5">
            Signed in as {staff?.email || session?.user?.email}
          </p>
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            This is your account-wide password. If you use the same login for other council systems, it changes there too.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New Password</label>
              <div className="mt-1 flex items-center border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-nublue-500">
                <Lock size={16} className="text-nublue-400 mr-2 shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  minLength={6}
                  required
                  className="w-full outline-none text-sm bg-transparent"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirm Password</label>
              <div className="mt-1 flex items-center border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-nublue-500">
                <Lock size={16} className="text-nublue-400 mr-2 shrink-0" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  minLength={6}
                  required
                  className="w-full outline-none text-sm bg-transparent"
                />
              </div>
            </div>

            {msg && (
              <div className={`text-xs rounded-lg px-3 py-2 border ${msg.type === 'success' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-nublue-600 hover:bg-nublue-700 text-white font-semibold py-2.5 rounded-xl transition shadow-glow disabled:opacity-60"
            >
              {submitting ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
