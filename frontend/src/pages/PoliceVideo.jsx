// PoliceVideo.jsx: police search a CCTV / phone video for a missing person.
// Pick a case, choose a short video (max 40 MB, MP4 works best). The backend
// checks up to 40 moments of the video against ALL photos of the case and
// shows the best moments with a picture of each. The video is not stored.

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'

async function getBackendUrl() {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'backend_url').maybeSingle()
  return (data?.value || import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function PoliceVideo() {
  const [params] = useSearchParams()
  const [cases, setCases] = useState([])
  const [caseId, setCaseId] = useState(params.get('case') || '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    supabase.from('missing_persons').select('id, full_name, age').eq('status', 'active').order('created_at', { ascending: false })
      .then(({ data }) => setCases(data ?? []))
  }, [])

  async function search(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!caseId) return setError('Choose the missing person first.')
    if (!file) return setError('Choose a video file.')
    if (file.size > 40 * 1024 * 1024) return setError('Video is too large (max 40 MB). Trim it to the important part.')
    setBusy(true)
    try {
      const [backend, { data }] = await Promise.all([getBackendUrl(), supabase.auth.getSession()])
      const form = new FormData()
      form.append('case_id', caseId)
      form.append('video_file', file)
      const res = await fetch(`${backend}/video/search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.detail || `Video search failed (${res.status}).`)
      setResult(body)
    } catch (err) {
      setError(err.message.includes('fetch') ? 'Could not reach the AI server. Is the backend running?' : err.message)
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <h2 className="bk-liquid bk-title">🎥 CCTV / video search</h2>
      <p className="text-sm text-white/75 px-1">
        Upload a short video (CCTV, phone clip). The AI checks up to 40 moments against every photo of the case.
        The video is not saved anywhere.
      </p>

      <form onSubmit={search} className="bk-sheet space-y-3">
        <label className="block text-sm font-semibold">Missing person</label>
        <select className="bk-input" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
          <option value="">Choose…</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.age != null ? `, ${c.age}` : ''}</option>)}
        </select>
        <label className="block text-sm font-semibold">Video (max 40 MB)</label>
        <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:font-semibold file:text-[#161214]" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full bk-btn bk-btn-orange !py-4">
          {busy ? '🤖 Checking the video… (up to a minute)' : 'Search video'}
        </button>
      </form>

      {result && (
        <section className="space-y-3">
          <p className="text-sm text-white/75 px-1">
            Checked {result.frames_checked} moments of a {mmss(result.duration_s)} video · {result.faces_seen} faces seen.
          </p>
          {result.moments.length === 0 && <p className="bk-sheet text-sm">No faces found in this video.</p>}
          {result.moments.map((m, i) => (
            <article key={i} className="bk-sheet flex gap-3 items-center">
              <img src={m.thumbnail} alt={`Moment at ${mmss(m.time_s)}`} className="w-36 rounded-xl shrink-0" />
              <div className="text-sm">
                <p className="text-lg font-semibold">⏱ {mmss(m.time_s)}</p>
                <p>{Math.round(m.similarity * 100)}% face match
                  {m.likely_match ? <b className="text-red-600"> · likely the person</b> : <span className="text-white/60"> · unlikely</span>}</p>
              </div>
            </article>
          ))}
          {caseId && <Link to={`/police/case/${caseId}`} className="underline text-sm px-1">Open the case</Link>}
        </section>
      )}
    </div>
  )
}
