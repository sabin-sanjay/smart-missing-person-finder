// PoliceFound.jsx: police/admin list of every "found someone" report.
// Each shows the photo, where and when they were found, the finder's notes,
// and the AI's best match among active missing cases. Police set the status:
// open -> matched (we know who it is) or closed (handled / not needed).

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/dates'

const LIKELY = 0.7
const STATUSES = ['open', 'matched', 'closed']

export default function PoliceFound() {
  const [rows, setRows] = useState([])
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('found_persons')
      .select('id, created_at, photo_path, lat, lng, description, status, match_score, face_checked_at, face_error, match_case:missing_persons(id, full_name, age)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) {
      setError('Could not load reports: ' + error.message)
      setLoading(false)
      return
    }
    setRows(data)
    setLoading(false)
    if (data.length) {
      const { data: signed } = await supabase.storage.from('found-photos').createSignedUrls(data.map((r) => r.photo_path), 3600)
      const map = {}
      signed?.forEach((s, i) => { if (s.signedUrl) map[data[i].id] = s.signedUrl })
      setUrls(map)
    }
  }, [])

  useEffect(() => {
    load()
    // live: new reports and AI results appear by themselves
    const channel = supabase
      .channel('found-persons')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'found_persons' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function setStatus(id, status) {
    const { error } = await supabase.from('found_persons').update({ status }).eq('id', id)
    if (error) setError('Could not update: ' + error.message)
    else setRows((list) => list.map((r) => (r.id === id ? { ...r, status } : r)))
  }

  const open = rows.filter((r) => r.status === 'open').length

  return (
    <div className="space-y-4">
      <h2 className="bk-liquid bk-title">Found persons <span className="text-muted text-lg">({open} open)</span></h2>
      <p className="text-sm text-white/70 px-1">
        People the public found and registered. The AI compares each photo with every active missing case.
      </p>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && rows.length === 0 && <p className="text-muted text-sm px-1">No found-person reports yet.</p>}

      {rows.map((r) => {
        const likely = r.match_case && r.match_score >= LIKELY
        return (
          <article key={r.id} className="bk-sheet space-y-3">
            <div className="flex gap-3">
              {urls[r.id]
                ? <img src={urls[r.id]} alt="Found person" className="w-24 h-24 rounded-2xl object-cover shrink-0" />
                : <div className="w-24 h-24 rounded-2xl bg-white/10 shrink-0" />}
              <div className="min-w-0 text-sm space-y-1">
                <p className="text-white/60 text-xs">Registered {timeAgo(r.created_at)}</p>
                {r.lat != null && (
                  <a className="underline block" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`}>
                    📍 Open location in maps
                  </a>
                )}
                {r.description && <p className="text-white/85 break-words">{r.description}</p>}
              </div>
            </div>

            {/* AI result */}
            <div className={`rounded-2xl px-3 py-2 text-sm ${likely ? 'bg-red-50' : 'bg-white/5'}`}>
              {!r.face_checked_at && <span className="text-white/70">🤖 AI is checking the photo…</span>}
              {r.face_checked_at && r.face_error && <span className="text-amber-700">🤖 {r.face_error}</span>}
              {r.face_checked_at && !r.face_error && r.match_case && (
                <span>
                  🤖 Best match: <b>{r.match_case.full_name}</b>
                  {r.match_case.age != null && `, ${r.match_case.age}`} · {Math.round(r.match_score * 100)}%
                  {likely ? <b className="text-red-600"> (likely)</b> : ' (unlikely)'}{' '}
                  <Link className="underline" to={`/police/case/${r.match_case.id}`}>Open case</Link>
                </span>
              )}
              {r.face_checked_at && !r.face_error && !r.match_case && <span className="text-white/70">🤖 No active cases to compare yet.</span>}
            </div>

            {/* Status */}
            <div className="flex gap-2">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setStatus(r.id, s)} aria-pressed={r.status === s}
                  className="lq-pill !py-2 !px-3 text-xs capitalize flex-1">
                  {s}
                </button>
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
}
