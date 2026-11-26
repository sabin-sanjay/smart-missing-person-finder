// AuthContext.jsx
// Keeps track of WHO is logged in, in one place, for the whole app.
// Any page can ask:   const { session, profile, loading } = useAuth()
//   session  -> login info (null if nobody is logged in)
//   profile  -> their row from the "profiles" table (name, phone, role)
//   loading  -> true while we're still checking

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // "undefined" means "not checked yet"; "null" means "checked: nobody/nothing".
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)

  // 1) Find out if someone is already logged in, and listen for
  //    log-in / log-out events from now on.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null)
      return
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    // Stop listening if this component is ever removed
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id
  const sessionChecked = session !== undefined

  // 2) Load the user's profile (role, name, phone) from the database.
  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, preferred_language')
      .eq('id', userId)
      .maybeSingle() // returns null instead of an error if no row exists
    if (error) console.error('Could not load profile:', error.message)
    setProfile(data ?? null)
  }, [userId])

  // Reload the profile once we know who's logged in, and again whenever
  // a different user logs in or out (refreshProfile changes when userId does).
  useEffect(() => {
    if (!sessionChecked) return // still checking
    setProfile(undefined)
    refreshProfile()
  }, [sessionChecked, refreshProfile])

  const value = {
    session: session ?? null,
    user: session?.user ?? null,
    profile: profile ?? null,
    role: profile?.role ?? null,
    loading: session === undefined || (Boolean(session) && profile === undefined),
    refreshProfile,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The hook pages use to read the login info
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
