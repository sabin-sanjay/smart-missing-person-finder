// ResetPassword.jsx: the page the "reset your password" email link opens.
// Supabase logs the user in from the link, then they choose a new password here.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function ResetPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError('Could not change password: ' + error.message)
    else navigate('/profile', { replace: true })
  }

  if (loading) return <p className="text-slate-500 text-sm">Loading…</p>

  // No login from the link: it expired or was already used
  if (!session) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-2 text-sm">
        <p>This reset link has expired or was already used.</p>
        <Link to="/login" className="text-blue-900 underline">Ask for a new link</Link>
      </div>
    )
  }

  const inputClass =
    'w-full border border-slate-300 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-900'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
      <h2 className="text-xl font-bold">Choose a new password</h2>
      <input className={inputClass} type="password" autoComplete="new-password"
        placeholder="New password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <input className={inputClass} type="password" autoComplete="new-password"
        placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full bg-blue-900 text-white rounded-lg py-3 font-semibold disabled:opacity-60">
        {busy ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  )
}
