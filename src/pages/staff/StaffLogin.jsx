import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth.jsx'
import Brand from '../../components/Brand.jsx'
import Footer from '../../components/Footer.jsx'
import { Lock, Mail, ShieldCheck, Eye, EyeOff, GraduationCap, ArrowLeft, Activity } from 'lucide-react'
import { runDiagnostics } from '../../supabaseClient'

export default function StaffLogin() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [diag, setDiag] = useState(null)
  const [checking, setChecking] = useState(false)

  const check = async () => {
    setChecking(true); setDiag(null)
    setDiag(await runDiagnostics())
    setChecking(false)
  }

  const friendly = (msg) => {
    if (/invalid login credentials/i.test(msg)) return `${msg}. If this is a fresh setup, make sure schema.sql was run (it creates the ADMIN_COL account).`
    if (/api key/i.test(msg)) return `${msg} — the app is not sending your Supabase key. Use "Connection check" below.`
    return msg
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) { setError(friendly(error.message)); check() }
    // On success the router redirects to /staff automatically.
  }

  return (
    <div
      className="h-screen w-full relative overflow-y-auto overflow-x-hidden bg-nublue-900 bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url('/LogInBG.png')" }}
    >
      <div className="fixed inset-0 bg-gradient-to-r from-nublue-900/90 via-nublue-900/70 to-nublue-900/30" />
      <div className="fixed inset-0 bg-gradient-to-t from-nublue-900/60 via-transparent to-nublue-900/40" />
      <div className="fixed -top-32 -left-32 w-96 h-96 bg-nugold-500/20 rounded-full blur-3xl" />
      <div className="fixed bottom-0 right-0 w-[30rem] h-[30rem] bg-nublue-400/20 rounded-full blur-3xl" />
      <div className="fixed top-1/3 left-1/2 w-72 h-72 bg-nugold-400/10 rounded-full blur-3xl" />

      <div className="relative z-10 min-h-full w-full flex items-center justify-center lg:justify-start px-4 sm:px-8 lg:pl-20 xl:pl-28 py-3">
        <div className="w-full max-w-md animate-fade-in">
          <div className="bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/25 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] p-5 sm:p-6 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/20 to-transparent rounded-t-3xl" />
            <div className="pointer-events-none absolute -top-1 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-nugold-400/80 to-transparent" />
            <div className="pointer-events-none absolute -top-8 -right-8 w-20 h-20 rounded-full border border-nugold-400/20" />

            <div className="relative inline-flex items-center gap-1.5 bg-nugold-400/10 border border-nugold-400/30 rounded-full px-2.5 py-0.5 mb-2.5">
              <GraduationCap size={11} className="text-nugold-300" />
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-nugold-300">Council Staff Access</span>
            </div>

            <div className="relative mb-2.5">
              <Brand variant="hero" />
              <div className="h-[3px] w-10 bg-gradient-to-r from-nugold-400 to-nugold-400/0 rounded-full mt-2" />
            </div>

            <p className="relative text-[11px] text-white/70 leading-snug mb-3">
              Sign in to review, respond to and resolve student complaints.
            </p>

            <form onSubmit={handleSubmit} className="relative space-y-2.5">
              <div>
                <label className="text-[10px] font-semibold text-white/70 uppercase tracking-wide">Email or Username</label>
                <div className="mt-1 flex items-center gap-2 bg-white/10 border border-white/25 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-nugold-400 focus-within:border-nugold-400 transition">
                  <div className="w-5 h-5 rounded-md bg-nugold-400/15 flex items-center justify-center flex-shrink-0">
                    <Mail size={11} className="text-nugold-300" />
                  </div>
                  <input type="text" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="Username or email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    className="w-full outline-none text-sm bg-transparent text-white placeholder-white/40" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-white/70 uppercase tracking-wide">Password</label>
                  <button type="button" onClick={() => setShowHelp((v) => !v)}
                    className="text-[10px] font-semibold text-nugold-300 hover:text-nugold-200 transition">
                    Forgot password?
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 bg-white/10 border border-white/25 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-nugold-400 focus-within:border-nugold-400 transition">
                  <div className="w-5 h-5 rounded-md bg-nugold-400/15 flex items-center justify-center flex-shrink-0">
                    <Lock size={11} className="text-nugold-300" />
                  </div>
                  <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full outline-none text-sm bg-transparent text-white placeholder-white/40" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="text-white/50 hover:text-white/80 transition flex-shrink-0"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {showHelp && (
                  <p className="text-[10px] text-white/60 mt-1 pl-1 leading-snug">
                    Password resets aren't self-service. Contact a Council of Leaders admin to have it reset.
                  </p>
                )}
              </div>

              {error && (
                <div className="text-xs text-red-100 bg-red-500/20 border border-red-400/40 rounded-lg px-3 py-1.5 backdrop-blur-sm">{error}</div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-nugold-400 to-nugold-500 hover:from-nugold-300 hover:to-nugold-400 text-nublue-900 font-bold py-2 rounded-xl transition shadow-[0_8px_20px_-6px_rgba(255,199,44,0.5)] flex items-center justify-center gap-2 disabled:opacity-60">
                <ShieldCheck size={16} />
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="relative flex items-center gap-2 mt-3 bg-white/5 border border-white/15 rounded-xl px-3 py-1.5">
              <ShieldCheck size={13} className="text-nugold-300 flex-shrink-0" />
              <p className="text-[10px] text-white/60 leading-snug">
                Staff access is granted by admins only. Students don't need an account — use the public site.
              </p>
            </div>

            <div className="relative mt-2">
              <button type="button" onClick={check} disabled={checking}
                className="mx-auto flex items-center gap-1 text-[10px] text-white/50 hover:text-white/80 transition">
                <Activity size={10} /> {checking ? 'Checking…' : 'Connection check'}
              </button>
              {diag && (
                <ul className="mt-2 space-y-1 bg-black/25 border border-white/15 rounded-lg p-2">
                  {diag.map((d) => (
                    <li key={d.label} className="text-[10px] leading-snug text-white/70">
                      <span className={d.ok ? 'text-emerald-300' : 'text-red-300'}>{d.ok ? '✔' : '✖'}</span> <span className="font-semibold">{d.label}</span>
                      <span className="block text-white/50 break-words">{d.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Link to="/" className="relative flex items-center justify-center gap-1 text-[10px] text-white/50 hover:text-white/80 mt-2 tracking-wide transition">
              <ArrowLeft size={10} /> Back to the public site
            </Link>
          </div>
          <Footer tone="light" />
        </div>
      </div>
    </div>
  )
}
