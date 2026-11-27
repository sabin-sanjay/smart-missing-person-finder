// NotFound.jsx — shown when someone opens an address that doesn't exist.

import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm ring-1 ring-slate-200/80 text-center">
      <h2 className="text-xl font-bold mb-2">Page not found</h2>
      <Link to="/" className="text-brand-700 underline">Go to Home</Link>
    </div>
  )
}
