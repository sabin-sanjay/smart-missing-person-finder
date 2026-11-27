// Login.jsx — log in or create an account, with email/password or Google.

import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { session, loading } = useAuth()
  const location = useLocation()

  const [mode, setMode] = useState('signin') // 'signin' or 'signup'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)     // true while waiting for Supabase
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Already logged in? Go to the page they wanted, or their profile.
  if (!loading && session) {
    return <Navigate to={location.state?.from || '/profile'} replace />
  }

  // Runs when the form's button is pressed
  async function handleSubmit(e) {
    e.preventDefault() // stop the browser reloading the page
    setError('')
    setMessage('')

    if (!isSupabaseConfigured) {
      setError('Database not connected. Fill in frontend/.env first.')
      return
    }

    // "Forgot password": email them a link to /reset-password
    if (mode === 'forgot') {
      setBusy(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      })
      setBusy(false)
      if (error) setError(friendlyError(error.message))
      // Same message whether or not the email exists, so nobody can use this
      // form to find out who has an account.
      else setMessage('If this email has an account, a reset link is on its way. Check your inbox.')
      return
    }

    if (mode === 'signup' && fullName.trim().length < 2) {
      setError('Please enter your full name.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setBusy(true)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(friendlyError(error.message))
      // On success, AuthContext notices and the redirect above happens automatically.
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() },            // saved into the profile
          emailRedirectTo: window.location.origin + '/profile', // where the email link opens
        },
      })
      if (error) {
        setError(friendlyError(error.message))
      } else if (!data.session) {
        // Supabase wants them to confirm their email first
        setMessage('Account created! Check your email and tap the confirmation link, then log in.')
        setMode('signin')
        setPassword('')
      }
    }
    setBusy(false)
  }

  async function handleGoogle() {
    setError('')
    if (!isSupabaseConfigured) {
      setError('Database not connected. Fill in frontend/.env first.')
      return
    }
    // This leaves our app, shows Google's login page, then comes back to /profile
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/profile' },
    })
    if (error) setError(friendlyError(error.message))
  }

  const inputClass =
    'w-full border border-slate-300 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-700'

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm ring-1 ring-slate-200/80 space-y-4">
      <h2 className="text-xl font-bold">
        {mode === 'signin' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Reset your password'}
      </h2>

      {mode !== 'forgot' && (
      <button
        type="button"
        onClick={handleGoogle}
        className="w-full border border-slate-300 rounded-lg py-3 font-semibold active:bg-slate-100"
      >
        <span className="text-blue-600">G</span> Continue with Google
      </button>
      )}

      {mode !== 'forgot' && <p className="text-center text-slate-400 text-sm">or use email</p>}

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'signup' && (
          <input
            className={inputClass}
            placeholder="Full name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}
        <input
          className={inputClass}
          type="email"
          placeholder="Email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== 'forgot' && (
          <input
            className={inputClass}
            type="password"
            placeholder="Password (min 8 characters)"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {mode === 'signin' && (
          <button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage('') }}
            className="text-sm text-brand-700 underline">
            Forgot password?
          </button>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-700 text-sm">{message}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-brand-700 text-white rounded-lg py-3 font-semibold disabled:opacity-60 active:bg-brand-800"
        >
          {busy ? 'Please wait…' : mode === 'signin' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError('')
          setMessage('')
        }}
        className="w-full text-brand-700 text-sm underline"
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Log in'}
      </button>
    </div>
  )
}

// Turns Supabase's technical error messages into plain words
function friendlyError(msg) {
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.'
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first (check your inbox).'
  if (/already registered/i.test(msg)) return 'This email already has an account. Try logging in.'
  if (/provider is not enabled/i.test(msg)) return 'Google login is not set up yet in Supabase.'
  if (/failed to fetch/i.test(msg)) return 'No internet connection. Please try again.'
  return msg
}
