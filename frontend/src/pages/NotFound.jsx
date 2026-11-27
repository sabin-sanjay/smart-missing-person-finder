// NotFound.jsx — shown when someone opens an address that doesn't exist.

import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div className="bk-sheet text-center">
      <h2 className="bk-liquid bk-title mb-2">Page not found</h2>
      <Link to="/" className="text-brand-700 underline">Go to Home</Link>
    </div>
  )
}
