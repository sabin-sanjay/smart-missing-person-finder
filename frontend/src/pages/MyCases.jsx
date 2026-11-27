// MyCases.jsx — the list of cases this user has registered, with their status.
// A case that is still "pending" can be deleted (e.g. if it was a mistake).

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { supabase, casePhotoUrl } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'

export default function MyCases() {
  const { user } = useAuth()
  const location = useLocation()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadCases() {
    // Only MY cases. (Police could see everyone's, so we filter by reported_by.)
    const { data, error } = await supabase
      .from('missing_persons')
      .select('id, full_name, age, photo_path, status, rejection_reason, last_seen_at, last_seen_address, created_at')
      .eq('reported_by', user.id)
      .order('created_at', { ascending: false })
    if (error) setError('Could not load your cases: ' + error.message)
    else setCases(data)
    setLoading(false)
  }

  useEffect(() => {
    loadCases()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteCase(c) {
    if (!window.confirm(`Delete the case for ${c.full_name}? This cannot be undone.`)) return
    const { error } = await supabase.from('missing_persons').delete().eq('id', c.id)
    if (error) {
      setError('Could not delete: ' + error.message)
      return
    }
    if (c.photo_path) await supabase.storage.from('case-photos').remove([c.photo_path])
    setCases((list) => list.filter((x) => x.id !== c.id)) // remove it from the screen
  }

  // Families can mark their own ACTIVE case as found (this stops the alerts).
  async function markFound(c) {
    if (!window.confirm(`Has ${c.full_name} been found? This stops all alerts.`)) return
    const { error } = await supabase.from('missing_persons').update({ status: 'found' }).eq('id', c.id)
    if (error) {
      setError('Could not update: ' + error.message)
      return
    }
    setCases((list) => list.map((x) => (x.id === c.id ? { ...x, status: 'found' } : x)))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="bk-liquid bk-title">My cases</h2>
        <Link to="/my-cases/new" className="bk-btn bk-btn-orange !py-2.5 !px-4">
          + New case
        </Link>
      </div>

      {location.state?.justCreated && (
        <p className="bg-green-50 text-green-800 text-sm rounded-lg p-3">
          ✅ Case submitted. The police will review it soon.
        </p>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && cases.length === 0 && (
        <p className="text-muted text-sm">You haven’t registered any cases.</p>
      )}

      <ul className="space-y-3">
        {cases.map((c) => (
          <li key={c.id} className="bk-sheet !p-3.5 flex gap-3">
            <img src={casePhotoUrl(c.photo_path)} alt={c.full_name} loading="lazy"
              className="w-20 h-20 rounded-lg object-cover bg-slate-200 shrink-0" />
            <div className="text-sm space-y-1 min-w-0">
              <p className="font-semibold">
                {c.full_name}{c.age != null && <span className="font-normal text-muted">, {c.age}</span>}
              </p>
              <StatusBadge status={c.status} />
              {c.status === 'rejected' && c.rejection_reason && (
                <p className="text-muted">Reason: {c.rejection_reason}</p>
              )}
              <p className="text-muted">Last seen {new Date(c.last_seen_at).toLocaleString()}</p>
              {c.status === 'pending' && (
                <button onClick={() => deleteCase(c)} className="text-red-600 underline">Delete</button>
              )}
              {c.status === 'active' && (
                <button onClick={() => markFound(c)}
                  data-haptic="strong" className="block bg-green-700 text-white rounded-lg px-3 py-2 font-semibold">
                  ✅ They’ve been found
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
