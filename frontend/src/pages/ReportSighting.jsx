// ReportSighting.jsx — "I saw this person": /report  or  /report?case=<id>
//
// 1. Pick which missing person you saw (nearest cases are listed first)
// 2. Mark where (GPS or tap the map) and when, add notes and an optional photo
// 3. Submit -> saved in the "sightings" table. Only police/admin (and you) can see it.

import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Trans, useTranslation } from 'react-i18next'
import { supabase, casePhotoUrl } from '../lib/supabase'
import { compressImage } from '../lib/compressImage'
import PhotoPicker from '../components/PhotoPicker'
import { randomId } from '../lib/randomId'
import { nowForInput } from '../lib/dates'
import { distanceKm, formatDistance, getCurrentPosition } from '../lib/geo'
import { useAuth } from '../context/AuthContext'

const LocationPicker = lazy(() => import('../components/LocationPicker.jsx'))

export default function ReportSighting() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('case') // the chosen case's id, kept in the address

  const [cases, setCases] = useState([])       // active cases to choose from
  const [loadingCases, setLoadingCases] = useState(true)
  const [point, setPoint] = useState(null)     // where the person was seen
  const [myLocation, setMyLocation] = useState(null)
  const [seenAt, setSeenAt] = useState(nowForInput())
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Load active cases, and try to get the phone's location at the same time
  useEffect(() => {
    supabase
      .from('missing_persons')
      .select('id, full_name, age, photo_path, last_seen_at, last_seen_address, last_seen_lat, last_seen_lng')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setError(t('report.errLoad', { detail: error.message }))
        else setCases(data)
        setLoadingCases(false)
      })

    getCurrentPosition().then((pos) => {
      if (pos) {
        setMyLocation(pos)
        setPoint((p) => p ?? pos) // use it as the sighting spot unless one was already chosen
      }
    })
  }, [])

  // If we know where the user is, show the nearest cases first
  const sortedCases = myLocation
    ? [...cases].sort(
        (a, b) =>
          distanceKm(myLocation, { lat: a.last_seen_lat, lng: a.last_seen_lng }) -
          distanceKm(myLocation, { lat: b.last_seen_lat, lng: b.last_seen_lng }),
      )
    : cases
  const selected = cases.find((c) => c.id === selectedId)

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const small = await compressImage(file)
      setPhoto(small)
      setPhotoPreview(URL.createObjectURL(small))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!point) return setError(t('report.errNoPoint'))
    if (!seenAt || new Date(seenAt) > new Date()) return setError(t('report.errTime'))

    setBusy(true)

    // 1) Upload the photo (optional) to the PRIVATE sighting-photos bucket
    let photoPath = null
    if (photo) {
      photoPath = `${user.id}/${randomId()}.jpg`
      const upload = await supabase.storage
        .from('sighting-photos')
        .upload(photoPath, photo, { contentType: 'image/jpeg' })
      if (upload.error) {
        setError(t('report.errUpload', { detail: upload.error.message }))
        setBusy(false)
        return
      }
    }

    // 2) Save the sighting
    const { error: insertError } = await supabase.from('sightings').insert({
      case_id: selected.id,
      seen_at: new Date(seenAt).toISOString(),
      lat: point.lat,
      lng: point.lng,
      notes: notes.trim() || null,
      photo_path: photoPath,
    })

    if (insertError) {
      if (photoPath) await supabase.storage.from('sighting-photos').remove([photoPath])
      setError(t('report.errSend', { detail: insertError.message }))
      setBusy(false)
      return
    }

    setBusy(false)
    setDone(true)
  }

  const inputClass =
    'bk-input'

  // ---- Thank-you screen ----
  if (done) {
    return (
      <div className="bk-sheet !p-6 text-center space-y-3">
        <p className="text-5xl">🙏</p>
        <h2 className="bk-liquid bk-title">{t('report.thankYou')}</h2>
        <p className="text-muted text-sm">
          <Trans i18nKey="report.thankText" components={{ link: <a href="tel:112" className="underline" /> }} />
        </p>
        <Link to="/" className="inline-block text-brand-700 underline">{t('report.backHome')}</Link>
      </div>
    )
  }

  // ---- Step 1: choose the person ----
  if (!selected) {
    return (
      <div className="space-y-4">
        <h2 className="bk-liquid bk-title">{t('report.whoDidYouSee')}</h2>
        {myLocation && <p className="text-xs text-muted">{t('report.nearestFirst')}</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {loadingCases && <p className="text-muted text-sm">{t('common.loading')}</p>}
        {!loadingCases && cases.length === 0 && (
          <p className="text-muted text-sm">{t('report.noActive')}</p>
        )}
        <ul className="space-y-3">
          {sortedCases.map((c) => (
            <li key={c.id}>
              <button
                data-haptic="light"
                onClick={() => setSearchParams({ case: c.id })}
                className="w-full bk-sheet !p-3.5 flex gap-3 text-left active:opacity-80"
              >
                <img src={casePhotoUrl(c.photo_path)} alt={c.full_name} loading="lazy"
                  className="w-16 h-16 rounded-lg object-cover bg-slate-200 shrink-0" />
                <div className="text-sm min-w-0">
                  <p className="font-semibold">
                    {c.full_name}{c.age != null && <span className="font-normal text-muted">, {c.age}</span>}
                  </p>
                  <p className="text-muted truncate">{c.last_seen_address || t('home.locationOnMap')}</p>
                  {myLocation && (
                    <p className="text-muted">
                      {t('report.fromYou', { distance: formatDistance(distanceKm(myLocation, { lat: c.last_seen_lat, lng: c.last_seen_lng })) })}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // ---- Step 2: the sighting form ----
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="bk-liquid bk-title">{t('report.title')}</h2>

      {/* The person they chose, with a way to change it */}
      <section className="bk-sheet !p-3.5 flex gap-3 items-center">
        <img src={casePhotoUrl(selected.photo_path)} alt={selected.full_name}
          className="w-16 h-16 rounded-lg object-cover bg-slate-200 shrink-0" />
        <div className="text-sm flex-1 min-w-0">
          <p className="font-semibold">{selected.full_name}</p>
          <button type="button" onClick={() => setSearchParams({})} className="text-brand-700 underline">
            {t('report.notThem')}
          </button>
        </div>
      </section>

      <section className="bk-sheet space-y-3">
        <div>
          <label className="block text-sm font-semibold mb-1">{t('report.where')}</label>
          <Suspense fallback={<div className="h-64 rounded-lg bg-slate-100" />}>
            <LocationPicker value={point} onChange={setPoint} />
          </Suspense>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">{t('report.when')}</label>
          <input type="datetime-local" className={`${inputClass} min-w-0 appearance-none`} max={nowForInput()}
            value={seenAt} onChange={(e) => setSeenAt(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">{t('report.details')}</label>
          <textarea rows="3" maxLength={1000} className={inputClass}
            placeholder={t('report.detailsPlaceholder')}
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">{t('report.photo')}</label>
          {photoPreview && <img src={photoPreview} alt="Preview" className="w-32 h-32 object-cover rounded-lg mb-2" />}
          <PhotoPicker onChange={handlePhoto} hasPhoto={Boolean(photoPreview)} />
        </div>
      </section>

      {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}

      <button type="submit" disabled={busy}
        data-haptic="strong" className="w-full bk-btn bk-btn-orange !py-4 !text-sm">
        {busy ? t('report.sending') : t('report.send')}
      </button>
    </form>
  )
}
