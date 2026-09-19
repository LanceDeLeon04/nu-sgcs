import React from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { LayoutGrid, Inbox, Users, Settings as SettingsIcon, LogOut, ShieldCheck, Globe } from 'lucide-react'
import Brand from './Brand.jsx'

const linkBase = 'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors'
const linkActive = 'bg-nublue-600 text-white shadow-glow'
const linkIdle = 'text-slate-500 hover:bg-nublue-50 hover:text-nublue-700'
const cls = ({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`

export default function StaffSidebar() {
  const { staff, isAdmin, signOut } = useAuth()
  const initials = (staff?.full_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('')

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-white border-r border-slate-100 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-100">
        <Brand variant="stack" />
        <div className="h-[3px] w-12 bg-gradient-to-r from-nugold-500 to-nugold-200 rounded-full mt-3" />
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1.5">
        <NavLink to="/staff" end className={cls}><LayoutGrid size={18} /> Dashboard</NavLink>
        <NavLink to="/staff/complaints" className={cls}><Inbox size={18} /> Complaints &amp; Feedback</NavLink>
        {isAdmin && <NavLink to="/staff/team" className={cls}><Users size={18} /> Manage Staff</NavLink>}
        <NavLink to="/staff/settings" className={cls}><SettingsIcon size={18} /> Settings</NavLink>
        <Link to="/" className={`${linkBase} ${linkIdle}`}><Globe size={18} /> Public Site</Link>
      </nav>

      <div className="px-4 py-4 border-t border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-nublue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700 truncate">{staff?.full_name}</p>
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
              {isAdmin && <ShieldCheck size={11} className="text-nugold-500" />}
              {staff?.position || (isAdmin ? 'Admin' : 'Handler')}
            </p>
          </div>
        </div>
        <button onClick={signOut}
          className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg py-2 transition">
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </aside>
  )
}
