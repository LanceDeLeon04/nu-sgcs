import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ShieldAlert, LogOut } from 'lucide-react'
import { useAuth } from './lib/auth.jsx'
import { APP_NAME, APP_SUBTITLE } from './lib/constants.js'
import StaffSidebar from './components/StaffSidebar.jsx'
import Footer from './components/Footer.jsx'
import { isConfigured } from './supabaseClient'

import Landing from './pages/Landing.jsx'
import Submit from './pages/Submit.jsx'
import TrackComplaint from './pages/TrackComplaint.jsx'
import StaffLogin from './pages/staff/StaffLogin.jsx'
import Dashboard from './pages/staff/Dashboard.jsx'
import Complaints from './pages/staff/Complaints.jsx'
import ComplaintDetail from './pages/staff/ComplaintDetail.jsx'
import Team from './pages/staff/Team.jsx'
import Settings from './pages/staff/Settings.jsx'

function LoadingScreen() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-nublue-900">
      <div className="flex flex-col items-center gap-3 text-center px-4">
        <div className="w-10 h-10 border-4 border-nugold-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/80 text-sm font-semibold">{APP_NAME}</p>
        <p className="text-white/50 text-xs -mt-2">{APP_SUBTITLE}</p>
      </div>
    </div>
  )
}

function NoAccess() {
  const { signOut, session } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f8ff] p-4">
      <div className="bg-white rounded-2xl border border-slate-100 card-glow p-8 max-w-md text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <ShieldAlert className="text-amber-500" size={24} />
        </div>
        <h1 className="font-bold text-slate-800 text-lg">No access to the Complaints System</h1>
        <p className="text-sm text-slate-500 mt-2">
          {session?.user?.email} is signed in, but this account hasn't been added to the complaints staff list
          (or has been deactivated). Ask a Council of Leaders admin to add you.
        </p>
        <button onClick={signOut}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg px-4 py-2 transition">
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  )
}

function StaffLayout({ children, adminOnly = false }) {
  const { session, loading, isStaff, isAdmin } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/staff/login" replace />
  if (!isStaff) return <NoAccess />
  if (adminOnly && !isAdmin) return <Navigate to="/staff" replace />
  return (
    <div className="flex min-h-screen bg-[#f5f8ff]">
      <StaffSidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1">{children}</div>
        <Footer className="border-t border-slate-100 bg-white" />
      </main>
    </div>
  )
}

function ConfigMissing() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f8ff] p-4">
      <div className="bg-white rounded-2xl border border-slate-100 card-glow p-8 max-w-lg">
        <h1 className="font-bold text-slate-800 text-lg">Supabase isn't connected yet</h1>
        <p className="text-sm text-slate-500 mt-2">
          This app can't find your Supabase URL and publishable key. Open the <span className="font-mono">.env</span> file
          in the project root and fill in:
        </p>
        <pre className="mt-3 text-xs bg-slate-50 border border-slate-100 rounded-xl p-3 overflow-x-auto">{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}</pre>
        <p className="text-xs text-slate-400 mt-3">
          Then restart <span className="font-mono">npm run dev</span> (Vite only reads .env at startup). On Vercel/Netlify,
          add the same two variables in the project's Environment Variables and redeploy.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuth()
  if (!isConfigured) return <ConfigMissing />

  return (
    <Routes>
      {/* Public — no account needed */}
      <Route path="/" element={<Landing />} />
      <Route path="/submit/:type?" element={<Submit />} />
      <Route path="/track/:code?" element={<TrackComplaint />} />

      {/* Staff */}
      <Route path="/staff/login"
        element={loading ? <LoadingScreen /> : session ? <Navigate to="/staff" replace /> : <StaffLogin />} />
      <Route path="/staff" element={<StaffLayout><Dashboard /></StaffLayout>} />
      <Route path="/staff/complaints" element={<StaffLayout><Complaints /></StaffLayout>} />
      <Route path="/staff/complaints/:id" element={<StaffLayout><ComplaintDetail /></StaffLayout>} />
      <Route path="/staff/team" element={<StaffLayout adminOnly><Team /></StaffLayout>} />
      <Route path="/staff/settings" element={<StaffLayout><Settings /></StaffLayout>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
