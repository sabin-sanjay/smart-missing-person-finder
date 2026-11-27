// AdminDashboard.jsx: admins see all users and can change their role
// (e.g. make a verified officer "police").
// The database double-checks: only admins can run admin_list_users or
// change someone else's role (Step 2 + 007 SQL).

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { timeAgo } from '../lib/dates'

const ROLES = ['public', 'family', 'police', 'admin']
const roleStyles = {
  admin: 'bg-purple-100 text-purple-800',
  police: 'bg-blue-100 text-blue-900',
  family: 'bg-amber-100 text-amber-800',
  public: 'bg-slate-100 text-slate-700',
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load(term = search) {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_users', { p_search: term.trim() })
    if (error) setError('Could not load users: ' + error.message)
    else {
      setUsers(data)
      setError('')
    }
    setLoading(false)
  }

  useEffect(() => {
    load('')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function changeRole(u, newRole) {
    if (newRole === u.role) return
    const who = u.full_name || u.email
    if (!window.confirm(`Change ${who} from "${u.role}" to "${newRole}"?`)) return
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', u.id)
    if (error) {
      setError('Could not change role: ' + error.message)
      return
    }
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)))
    setMessage(`${who} is now ${newRole}.`)
  }

  const count = (role) => users.filter((u) => u.role === role).length

  return (
    <div className="space-y-4">
      <h2 className="bk-liquid bk-title">⚙️ Manage users</h2>

      <form onSubmit={(e) => { e.preventDefault(); load() }} className="flex gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email or phone"
          className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-base" />
        <button className="bk-btn bk-btn-ink !px-5">Search</button>
      </form>

      <p className="text-xs text-muted">
        Showing {users.length}: {ROLES.map((r) => `${count(r)} ${r}`).join(' · ')}
      </p>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {message && <p className="text-green-700 text-sm">{message}</p>}
      {loading && <p className="text-muted text-sm">Loading…</p>}

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="bk-sheet !p-3.5 text-sm space-y-1">
            <div className="flex justify-between gap-2 items-start">
              <div className="min-w-0">
                <p className="font-semibold truncate">{u.full_name || '(no name)'}</p>
                <p className="text-muted break-all">{u.email}</p>
                {u.phone && <p className="text-muted">📞 {u.phone}</p>}
              </div>
              <span className={`shrink-0 text-xs font-semibold uppercase px-2 py-1 rounded ${roleStyles[u.role]}`}>
                {u.role}
              </span>
            </div>
            <p className="text-xs text-muted">
              Joined {timeAgo(u.created_at)}
              {u.last_sign_in_at && ` · last login ${timeAgo(u.last_sign_in_at)}`}
            </p>
            {u.id === user.id ? (
              <p className="text-xs text-muted">This is you. (You can’t change your own role here, so you can’t lock yourself out.)</p>
            ) : (
              <label className="flex items-center gap-2">
                <span className="text-muted">Role:</span>
                <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
