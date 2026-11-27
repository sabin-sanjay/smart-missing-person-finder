// Profile.jsx — shows who is logged in, lets them edit their name/phone,
// switch to a "family" account, open their role's pages, and log out.

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// What each role means, shown to the user
const roleInfo = {
  public: 'You get alerts and can report sightings.',
  family: 'You can register and manage missing-person cases for your family.',
  police: 'You can verify cases, see all sightings and download case PDFs.',
  admin: 'You can do everything police can, and manage users.',
}

export default function Profile() {
  const { user, profile, role, refreshProfile, signOut } = useAuth()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Fill the form with the saved values once the profile has loaded
  useEffect(() => {
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
  }, [profile])

  // The profile row is made automatically at sign-up. If it's missing,
  // the database script (Step 2) probably wasn't run before this account was made.
  if (!profile) {
    return (
      <div className="bk-sheet space-y-3">
        <p className="text-red-600 text-sm">
          Your profile could not be found. Make sure supabase/001_initial_schema.sql was run,
          then delete this user in Supabase (Authentication → Users) and sign up again.
        </p>
        <button onClick={signOut} className="text-brand-700 underline text-sm">Log out</button>
      </div>
    )
  }

  // Saves changes to the database. RLS only lets users update their OWN profile.
  async function saveProfile(changes, successText) {
    setBusy(true)
    setError('')
    setMessage('')
    const { error } = await supabase.from('profiles').update(changes).eq('id', user.id)
    if (error) {
      setError('Could not save: ' + error.message)
    } else {
      setMessage(successText)
      await refreshProfile()
    }
    setBusy(false)
  }

  function handleSave(e) {
    e.preventDefault()
    const cleanPhone = phone.replace(/[\s-]/g, '') // remove spaces and dashes
    // Indian mobile: 10 digits starting 6-9, optionally with +91 in front
    if (cleanPhone && !/^(\+91)?[6-9]\d{9}$/.test(cleanPhone)) {
      setError('Enter a valid 10-digit Indian mobile number.')
      return
    }
    saveProfile({ full_name: fullName.trim() || null, phone: cleanPhone || null }, 'Saved ✓')
  }

  const inputClass =
    'bk-input'

  return (
    <div className="space-y-4">
      {/* Who you are */}
      <section className="bk-sheet">
        <p className="text-sm text-muted">Logged in as</p>
        <p className="font-semibold break-all">{user.email}</p>
        <p className="mt-2">
          <span className="inline-block bg-brand-100 text-brand-700 text-xs font-semibold uppercase px-2 py-1 rounded">
            {role}
          </span>
        </p>
        <p className="text-sm text-muted mt-1">{roleInfo[role]}</p>
      </section>

      {/* Pages for your role */}
      {role !== 'public' && (
        <section className="bk-sheet space-y-2">
          <RoleLink to="/my-cases" text="📋 My cases" />
          {(role === 'police' || role === 'admin') && <RoleLink to="/police" text="🛡️ Police dashboard" />}
          {role === 'admin' && <RoleLink to="/admin" text="⚙️ Admin: manage users" />}
        </section>
      )}

      {/* Edit details */}
      <form onSubmit={handleSave} className="bk-sheet space-y-3">
        <h3 className="font-semibold">Your details</h3>
        <input className={inputClass} placeholder="Full name" value={fullName}
          onChange={(e) => setFullName(e.target.value)} />
        <input className={inputClass} type="tel" placeholder="Mobile number (for SMS alerts)" value={phone}
          onChange={(e) => setPhone(e.target.value)} />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-700 text-sm">{message}</p>}
        <button type="submit" disabled={busy}
          className="w-full bk-btn bk-btn-ink">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>

      {/* Public <-> family switch. (Police/admin roles can only be given by an admin.) */}
      {role === 'public' && (
        <section className="bk-sheet space-y-2">
          <p className="text-sm text-muted">Is someone in your family missing?</p>
          <button disabled={busy}
            onClick={() => saveProfile({ role: 'family' }, 'You can now register a missing person.')}
            className="w-full bk-btn bk-btn-orange">
            Switch to family account
          </button>
        </section>
      )}
      {role === 'family' && (
        <button disabled={busy}
          onClick={() => saveProfile({ role: 'public' }, 'Switched back to a public account.')}
          className="w-full text-muted text-sm underline">
          Switch back to a public account
        </button>
      )}

      <button onClick={signOut}
        className="w-full border border-slate-300 rounded-lg py-3 font-semibold text-red-600 active:bg-slate-100">
        Log out
      </button>
    </div>
  )
}

function RoleLink({ to, text }) {
  return (
    <Link to={to} className="block bg-slate-100 rounded-lg px-3 py-3 font-semibold active:bg-slate-200">
      {text}
    </Link>
  )
}
