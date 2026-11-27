// ProtectedRoute.jsx
// Wrap a page in this to say "only logged-in users (with these roles) may open it".
//
//   <ProtectedRoute>                        -> any logged-in user
//   <ProtectedRoute roles={['police','admin']}> -> only police or admin
//
// NOTE: this only HIDES pages in the app. The real protection is the
// Row Level Security in the database (Step 2), which a hacker can't skip.

import { Navigate, useLocation, Link } from 'react-router'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ roles, children }) {
  const { session, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="text-muted text-sm">Loading…</p>
  }

  // Not logged in: send them to the login page, remembering where they wanted to go
  if (!session) {
    // (pathname + search keeps things like "?case=123" in the address)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  // Logged in but wrong role
  if (roles && !roles.includes(role)) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm ring-1 ring-slate-200/80 text-center space-y-2">
        <h2 className="text-xl font-bold">Not allowed</h2>
        <p className="text-muted text-sm">
          This page is only for: {roles.join(', ')}. Your role is: {role ?? 'unknown'}.
        </p>
        <Link to="/" className="text-brand-700 underline">Go to Home</Link>
      </div>
    )
  }

  return children
}
