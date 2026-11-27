// NotFound.jsx — shown when someone opens an address that doesn't exist.

import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm text-center">
      <h2 className="text-xl font-bold mb-2">Page not found</h2>
      <Link to="/" className="text-emerald-800 underline">Go to Home</Link>
    </div>
  )
}
