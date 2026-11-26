// FaceSearch.jsx: "Found someone who seems lost? Check if they've been reported missing."
// The photo goes to our backend's face-recognition AI, which compares it with
// every ACTIVE case and returns the closest matches.
// The photo is NOT saved anywhere; it's only compared, then forgotten.

import { useState } from 'react'
import { Link } from 'react-router'
import { supabase, casePhotoUrl } from '../lib/supabase'
import { compressImage } from '../lib/compressImage'
import { timeAgo } from '../lib/dates'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')

export default function FaceSearch() {
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { face_found, matches }

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResult(null)

    if (!BACKEND_URL) {
      setError('The backend address is not set. Add VITE_BACKEND_URL to frontend/.env.')
      return
    }

    setBusy(true)
    try {
      const small = await compressImage(file)
      setPreview(URL.createObjectURL(small))

      // Send our login token so the backend knows we're a real logged-in user
      const { data } = await supabase.auth.getSession()
      const body = new FormData()
      body.append('photo', small, 'photo.jpg')

      const response = await fetch(`${BACKEND_URL}/faces/search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body,
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.detail || `Search failed (error ${response.status})`)
      setResult(json)
    } catch (err) {
      setError(
        err.message === 'Failed to fetch'
          ? 'Could not reach the face-matching server. It may be starting up. Try again in a minute.'
          : err.message,
      )
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">🔍 Who is this?</h2>
      <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <p className="text-sm text-slate-600">
          Found someone who seems lost or confused? Take a clear photo of their face to check if
          they’ve been reported missing. The photo is only compared, never saved.
        </p>
        {preview && <img src={preview} alt="Your photo" className="w-32 h-32 object-cover rounded-lg" />}
        <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} disabled={busy}
          className="block w-full text-sm" />
        {busy && <p className="text-sm text-slate-500">🤖 Comparing faces… (this can take up to 30 seconds)</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      {result && !result.face_found && (
        <p className="bg-amber-50 text-amber-800 text-sm rounded-lg p-3">
          No face could be found in this photo. Try a closer, well-lit photo facing the camera.
        </p>
      )}

      {result?.face_found && result.matches.length === 0 && (
        <p className="bg-slate-100 text-slate-700 text-sm rounded-lg p-3">
          No matching missing-person case found. If the person needs help, call <a href="tel:112" className="underline">112</a>.
        </p>
      )}

      {result?.matches?.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">Possible matches</h3>
          {result.matches.map((m) => (
            <div key={m.case_id} className="bg-white rounded-xl p-3 shadow-sm flex gap-3">
              <img src={casePhotoUrl(m.photo_path)} alt={m.full_name}
                className="w-20 h-20 rounded-lg object-cover bg-slate-200 shrink-0" />
              <div className="text-sm space-y-1 min-w-0">
                <p className="font-semibold">
                  {m.full_name}{m.age != null && <span className="font-normal text-slate-500">, {m.age}</span>}
                </p>
                <p className={m.likely_match ? 'text-red-700 font-semibold' : 'text-amber-700'}>
                  {m.likely_match ? '⚠️ Likely match' : 'Possible match'}: {Math.round(m.similarity * 100)}%
                </p>
                <p className="text-slate-500">Missing since {timeAgo(m.last_seen_at)}</p>
                <div className="flex gap-3">
                  <Link to={`/case/${m.case_id}`} className="text-blue-900 underline">Details</Link>
                  <Link to={`/report?case=${m.case_id}`} className="text-red-600 underline font-semibold">Report sighting</Link>
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            AI matches can be wrong. Compare the photos yourself, and let the police confirm.
          </p>
        </section>
      )}
    </div>
  )
}
