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
      <h2 className="text-xl font-bold">🛡️ Police dashboard</h2>

      {/* Tabs. "overflow-x-auto" lets them scroll sideways on very small phones. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => setTab(t.status)}
            className={
              'shrink-0 rounded-full px-3 py-2 text-sm font-semibold ' +
              (tab === t.status ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 border border-slate-300')
            }
          >
            {t.label} ({countOf(t.status)})
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!loading && shown.length === 0 && (
        <p className="text-slate-500 text-sm">No {tab} cases.</p>
      )}

      <ul className="space-y-3">
        {shown.map((c) => (
          <li key={c.id}>
            <Link to={`/police/case/${c.id}`} className="bg-white rounded-xl p-3 shadow-sm ring-1 ring-slate-200/80 flex gap-3 active:bg-slate-50">
              <img src={casePhotoUrl(c.photo_path)} alt={c.full_name} loading="lazy"
                className="w-16 h-16 rounded-lg object-cover bg-slate-200 shrink-0" />
              <div className="text-sm min-w-0">
                <p className="font-semibold">
                  {c.full_name}{c.age != null && <span className="font-normal text-slate-500">, {c.age}</span>}
                </p>
                <p className="text-slate-600 truncate">{c.last_seen_address || 'Location on map'}</p>
                <p className="text-slate-500">Reported {new Date(c.created_at).toLocaleString()}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
