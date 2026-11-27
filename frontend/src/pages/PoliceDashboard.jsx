// PoliceDashboard.jsx — for police and admin.
// Shows every case, grouped in tabs by status. Tap a case to open it and
// approve, reject or mark it found.
// The list updates LIVE: when a family submits a new case, it pops up here
// without refreshing (Supabase Realtime).

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase, casePhotoUrl } from '../lib/supabase'

const TABS = [
  { status: 'pending', label: 'Pending' },
  { status: 'active', label: 'Active' },
  { status: 'found', label: 'Found' },
  { status: 'rejected', label: 'Rejected' },
]

export default function PoliceDashboard() {
  const [tab, setTab] = useState('pending')
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Load ALL cases (police can see every case thanks to the RLS rules)
  async function loadCases() {
    const { data, error } = await supabase
      .from('missing_persons')
      .select('id, full_name, age, gender, photo_path, status, last_seen_at, last_seen_address, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) setError('Could not load cases: ' + error.message)
    else {
      setCases(data)
      setError('')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadCases()

    // Listen for any change to the missing_persons table and reload the list
    const channel = supabase
      .channel('police-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missing_persons' }, () => loadCases())
      .subscribe()

    return () => {
      supabase.removeChannel(channel) // stop listening when leaving the page
    }
  }, [])

  const shown = cases.filter((c) => c.status === tab)
  const countOf = (status) => cases.filter((c) => c.status === status).length

  return (
    <div className="space-y-4">
      <h2 className="bk-liquid bk-title">🛡️ Police dashboard</h2>
      <Link to="/police/analytics" className="bk-row">
        <span>📊 Analytics <span className="text-muted text-sm">· charts, hotspots, alerts</span></span>
        <span aria-hidden="true" className="text-muted">›</span>
      </Link>
      <Link to="/police/found" className="bk-row">
        <span>🧍 Found persons <span className="text-muted text-sm">· registered by the public, AI-matched</span></span>
        <span aria-hidden="true" className="text-muted">›</span>
      </Link>

      {/* Tabs. "overflow-x-auto" lets them scroll sideways on very small phones. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => setTab(t.status)}
            className={
              'shrink-0 rounded-full px-3 py-2 text-sm font-semibold ' +
              (tab === t.status ? 'bk-liquid' : 'bg-[#1c1a1b] text-ink border border-white/10')
            }
          >
            {t.label} ({countOf(t.status)})
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && shown.length === 0 && (
        <p className="text-muted text-sm">No {tab} cases.</p>
      )}

      <ul className="space-y-3">
        {shown.map((c) => (
          <li key={c.id}>
            <Link to={`/police/case/${c.id}`} className="bk-sheet !p-3.5 flex gap-3 active:opacity-80">
              <img src={casePhotoUrl(c.photo_path)} alt={c.full_name} loading="lazy"
                className="w-16 h-16 rounded-lg object-cover bg-slate-200 shrink-0" />
              <div className="text-sm min-w-0">
                <p className="font-semibold">
                  {c.full_name}{c.age != null && <span className="font-normal text-muted">, {c.age}</span>}
                </p>
                <p className="text-muted truncate">{c.last_seen_address || 'Location on map'}</p>
                <p className="text-muted">Reported {new Date(c.created_at).toLocaleString()}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
