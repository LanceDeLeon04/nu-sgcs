import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

// Only council STAFF sign in. The public (complainant) side needs no account.
// Being signed in is not enough -- you must also have an active row in gc_staff.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null) // row from public.gc_staff
  const [loading, setLoading] = useState(true)
  const [staffReady, setStaffReady] = useState(true) // false while the gc_staff row is being fetched for a new session

  const loadStaff = async (userId) => {
    if (!userId) { setStaff(null); setStaffReady(true); return }
    const { data } = await supabase.from('gc_staff').select('*').eq('user_id', userId).maybeSingle()
    setStaff(data || null)
    setStaffReady(true)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) await loadStaff(session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      // Defer: awaiting supabase calls directly inside this callback can deadlock the client.
      if (session?.user) {
        setStaffReady(false)
        setTimeout(() => loadStaff(session.user.id), 0)
      } else {
        setStaff(null)
        setStaffReady(true)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Staff may type an email OR a plain username (e.g. ADMIN_COL). A username is mapped to
  // <username>@col.local, which is how the built-in account is stored in Supabase Auth.
  const toEmail = (id) => {
    const v = (id || '').trim()
    return v.includes('@') ? v : `${v.toLowerCase()}@col.local`
  }

  const signIn = async (identifier, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(identifier), password })
    return { error }
  }
  const signOut = async () => { await supabase.auth.signOut() }

  const isStaff = !!staff?.is_active
  const isAdmin = isStaff && staff.role === 'admin'

  return (
    <AuthContext.Provider value={{
      session, staff, loading: loading || (!!session && !staffReady), isStaff, isAdmin, signIn, signOut,
      refreshStaff: () => loadStaff(session?.user?.id),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
