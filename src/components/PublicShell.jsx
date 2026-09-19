import React from 'react'
import { Link, NavLink } from 'react-router-dom'
import { FilePlus2, Search, LogIn } from 'lucide-react'
import Brand from './Brand.jsx'
import Footer from './Footer.jsx'
import ChatWidget from './ChatWidget.jsx'

const link = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors'
const active = 'bg-nublue-600 text-white'
const idle = 'text-slate-500 hover:bg-nublue-50 hover:text-nublue-700'

// Light-themed layout used by the public Submit / Track pages.
export default function PublicShell({ children, wide = false }) {
  return (
    <div className="min-h-screen bg-[#f5f8ff] flex flex-col">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/"><Brand /></Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/submit" className={({ isActive }) => `${link} ${isActive ? active : idle}`}>
              <FilePlus2 size={15} /> <span className="hidden sm:inline">Feedback / Complaint</span><span className="sm:hidden">Submit</span>
            </NavLink>
            <NavLink to="/track" className={({ isActive }) => `${link} ${isActive ? active : idle}`}>
              <Search size={15} /> <span className="hidden sm:inline">Track</span>
            </NavLink>
            <Link to="/staff/login" className={`${link} ${idle}`}>
              <LogIn size={15} /> <span className="hidden md:inline">Staff</span>
            </Link>
          </nav>
        </div>
        <div className="h-[3px] bg-gradient-to-r from-nugold-500 via-nugold-300 to-transparent" />
      </header>

      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 py-8 ${wide ? 'max-w-5xl' : 'max-w-3xl'} animate-fade-in`}>
        {children}
      </main>

      <Footer className="border-t border-slate-100 bg-white" />
      <ChatWidget />
    </div>
  )
}
