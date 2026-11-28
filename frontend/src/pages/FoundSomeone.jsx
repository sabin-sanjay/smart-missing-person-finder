// FoundSomeone.jsx: register an UNKNOWN person you have found
// (a lost child, a confused elderly person...).
//
// 1. Take or choose their photo, mark where they are, add a few words.
// 2. The photo goes to a PRIVATE folder (only you and the police can see it).
// 3. Within a minute or two the backend's AI compares the face with every
//    active missing-person case. The result shows below under "My reports",
//    and police get a notification if it's a likely match (70%+).

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { compressImage } from '../lib/compressImage'
import PhotoPicker from '../components/PhotoPicker'
import VoiceButton from '../components/VoiceButton'
import { timeAgo } from '../lib/dates'

const LocationPicker = lazy(() => import('../components/LocationPicker.jsx'))
const LIKELY = 0.7

function randomId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function FoundSomeone() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [point, setPoint] = useState(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const [reports, setReports] = useState([])
  const [photoUrls, setPhotoUrls] = useState({})

  // Load my earlier reports (newest first) with the AI's result
  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from('found_persons')
      .select('id, created_at, photo_path, status, match_score, face_checked_at, face_error, match_case:missing_persons(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(20)
    const rows = data ?? []
    setReports(rows)
    if (rows.length) {
      const { data: signed } = await supabase.storage
        .from('found-photos')
        .createSignedUrls(rows.map((r) => r.photo_path), 3600)
      const urls = {}
      signed?.forEach((s, i) => { if (s.signedUrl) urls[rows[i].id] = s.signedUrl })
      setPhotoUrls(urls)
    }
  }, [])

  useEffect(() => { loadReports() }, [loadReports])

  // While the AI is still checking a photo, look again every 15 seconds
  useEffect(() => {
    if (!reports.some((r) => !r.face_checked_at)) return
    const id = setInterval(loadReports, 15000)
    return () => clearInterval(id)
  }, [reports, loadReports])

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const small = await compressImage(file)
      setPhoto(small)
      setPreview(URL.createObjectURL(small))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!photo) return setError(t('found.errPhoto'))
    setBusy(true)

    // 1) Photo into the PRIVATE found-photos folder
    const photoPath = `${user.id}/${randomId()}.jpg`
    const upload = await supabase.storage.from('found-photos').upload(photoPath, photo, { contentType: 'image/jpeg' })
    if (upload.error) {
      setError(t('found.errUpload', { detail: upload.error.message }))
      setBusy(false)
      return
    }

    // 2) The report itself
    const { error: insertError } = await supabase.from('found_persons').insert({
      reported_by: user.id,
      photo_path: photoPath,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      description: notes.trim() || null,
    })
    if (insertError) {
      await supabase.storage.from('found-photos').remove([photoPath])
      setError(t('found.errSend', { detail: insertError.message }))
      setBusy(false)
      return
    }

    setBusy(false)
    setSent(true)
    setPhoto(null)
    setPreview('')
    setNotes('')
    setPoint(null)
    loadReports()
  }

  // What to show for one report
  function result(r) {
    if (!r.face_checked_at) return <span className="text-white/70">{t('found.checking')}</span>
    if (r.face_error) return <span className="text-amber-700">{t('found.noFace')}</span>
    if (r.match_case && r.match_score >= LIKELY) {
      return (
        <span>
          <span className="font-semibold text-red-600">
            {t('found.possible', { name: r.match_case.full_name, pct: Math.round(r.match_score * 100) })}
          </span>{' '}
          <Link to={`/case/${r.match_case.id}`} className="underline">{t('found.viewCase')}</Link>
        </span>
      )
    }
    return <span className="text-white/70">{t('found.noMatch')}</span>
  }

  return (
    <div className="space-y-4">
      <h2 className="bk-liquid bk-title">{t('found.title')}</h2>
      <p className="text-sm text-white/75 px-1">{t('found.intro')}</p>
      <p className="text-sm font-semibold text-red-600 px-1">{t('found.emergencyTip')}</p>

      {sent && <p className="bk-sheet text-sm">{t('found.thanks')}</p>}

      <form onSubmit={handleSubmit} className="bk-sheet space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-1">{t('found.photo')}</label>
          {preview && <img src={preview} alt="" className="w-32 h-32 object-cover rounded-2xl mb-2" />}
          <PhotoPicker onChange={handlePhoto} hasPhoto={Boolean(preview)} />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">{t('found.where')}</label>
          <Suspense fallback={<div className="h-64 rounded-2xl bg-slate-100" />}>
            <LocationPicker value={point} onChange={setPoint} />
          </Suspense>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="block text-sm font-semibold">{t('found.details')}</label>
            <VoiceButton onText={(text) => setNotes((n) => (n ? `${n} ` : '') + text)} />
          </div>
          <textarea rows="3" maxLength={1000} className="bk-input"
            placeholder={t('found.detailsPlaceholder')}
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}

        <button type="submit" disabled={busy} data-haptic="strong" className="w-full bk-btn bk-btn-orange !py-4 !text-sm">
          {busy ? t('found.sending') : t('found.send')}
        </button>
      </form>

      {reports.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-lg px-1">{t('found.myReports')}</h3>
          {reports.map((r) => (
            <div key={r.id} className="bk-sheet flex gap-3 items-center">
              {photoUrls[r.id]
                ? <img src={photoUrls[r.id]} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
                : <div className="w-14 h-14 rounded-full bg-white/10 shrink-0" />}
              <div className="min-w-0 text-sm">
                <p className="text-white/60 text-xs">{timeAgo(r.created_at)}</p>
                <p className="mt-0.5">{result(r)}</p>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
