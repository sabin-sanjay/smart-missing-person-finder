// CaseSightings.jsx — on the police case page, lists every sighting
// reported for this case (newest first), live.
// Police can mark each one ✓ Confirmed or ✖ Dismissed.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { distanceKm, formatDistance, googleMapsLink } from '../lib/geo'
import { timeAgo } from '../lib/dates'

const reviewStyles = {
  new: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-green-100 text-green-800',
  dismissed: 'bg-slate-200 text-muted',
}

// The AI face-match result for one sighting photo.
// 70%+ is DeepFace's own "same person" cut-off for the Facenet512 model.
function FaceMatch({ score, error, hasPhoto }) {
  if (!hasPhoto) return null
  if (error) return <p className="text-muted">🤖 Face match: not possible ({error})</p>
  if (score == null) return <p className="text-muted">🤖 Face match: checking…</p>
  const pct = Math.round(score * 100)
  if (score >= 0.7) return <p className="text-red-700 font-semibold">🤖 Face match: {pct}%, likely the same person</p>
  if (score >= 0.5) return <p className="text-amber-700">🤖 Face match: {pct}%, possible</p>
  return <p className="text-muted">🤖 Face match: {pct}%, probably a different person</p>
}

export default function CaseSightings({ caseId, lastSeen }) {
  const [sightings, setSightings] = useState([])
  const [photoUrls, setPhotoUrls] = useState({}) // photo_path -> temporary web address
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    const { data, error } = await supabase
      .from('sightings')
      .select('id, seen_at, lat, lng, notes, photo_path, face_match_score, face_error, review_status, created_at, reporter:profiles!reported_by(full_name, phone)')
      .eq('case_id', caseId)
      .order('seen_at', { ascending: false })
    if (error) {
      setError('Could not load sightings: ' + error.message)
      setLoading(false)
      return
    }
    setSightings(data)
    setLoading(false)

    // Sighting photos are PRIVATE, so we ask for temporary links (valid 1 hour)
    const paths = data.map((s) => s.photo_path).filter(Boolean)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('sighting-photos').createSignedUrls(paths, 3600)
      const urls = {}
      signed?.forEach((s) => { if (s.signedUrl) urls[s.path] = s.signedUrl })
      setPhotoUrls(urls)
    }
  }

  useEffect(() => {
    load()
    // Live: reload when a new sighting for THIS case arrives or one is reviewed
    const channel = supabase
      .channel(`sightings-${caseId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sightings', filter: `case_id=eq.${caseId}` },
        () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [caseId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function review(id, review_status) {
    const { error } = await supabase.from('sightings').update({ review_status }).eq('id', id)
    if (error) setError('Could not update: ' + error.message)
    else setSightings((list) => list.map((s) => (s.id === id ? { ...s, review_status } : s)))
  }

  return (
    <section className="bk-sheet space-y-3">
      <h3 className="font-semibold">Sightings ({sightings.length})</h3>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && sightings.length === 0 && <p className="text-muted text-sm">No sightings reported yet.</p>}

      <ul className="space-y-3">
        {sightings.map((s) => (
          <li key={s.id} className="border border-slate-200 rounded-lg p-3 text-sm space-y-2">
            <div className="flex justify-between gap-2 items-start">
              <div>
                <p className="font-semibold">{timeAgo(s.seen_at)}</p>
                <p className="text-muted text-xs">{new Date(s.seen_at).toLocaleString()}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded ${reviewStyles[s.review_status]}`}>
                {s.review_status}
              </span>
            </div>

            {s.photo_path && photoUrls[s.photo_path] && (
              <img src={photoUrls[s.photo_path]} alt="Sighting" loading="lazy"
                className="w-full max-h-60 object-contain rounded bg-slate-100" />
            )}
            {s.notes && <p className="whitespace-pre-line">{s.notes}</p>}
            <FaceMatch score={s.face_match_score} error={s.face_error} hasPhoto={Boolean(s.photo_path)} />

            <p>
              📍 {formatDistance(distanceKm(lastSeen, { lat: s.lat, lng: s.lng }))} from last-seen spot ·{' '}
              <a href={googleMapsLink(s.lat, s.lng)} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                Open in Google Maps
              </a>
            </p>
            <p className="text-muted">
              By {s.reporter?.full_name || 'unknown'}
              {s.reporter?.phone && <> · <a href={`tel:${s.reporter.phone}`} className="text-brand-700 underline">📞 {s.reporter.phone}</a></>}
            </p>

            {s.review_status === 'new' && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => review(s.id, 'confirmed')} className="bg-green-700 text-white rounded-lg py-2 font-semibold">
                  ✓ Confirm
                </button>
                <button onClick={() => review(s.id, 'dismissed')} className="border border-slate-300 rounded-lg py-2 font-semibold">
                  ✖ Dismiss
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
