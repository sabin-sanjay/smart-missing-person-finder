// CaseView.jsx: the public page for one missing person: /case/<id>
// Anyone can open it (no login needed) for ACTIVE or FOUND cases.
// Push alerts link straight here.

import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Trans, useTranslation } from 'react-i18next'
import { supabase, casePhotoUrl } from '../lib/supabase'
import { timeAgo } from '../lib/dates'
import StatusBadge from '../components/StatusBadge'
import SharePosterButton from '../components/SharePosterButton'
import CaseTimeline from '../components/CaseTimeline'

const LocationPicker = lazy(() => import('../components/LocationPicker.jsx'))

export default function CaseView() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const [c, setCase] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Only the columns the public needs. RLS hides pending/rejected cases
    // from the public, so those simply come back as "not found".
    supabase
      .from('missing_persons')
      .select('id, full_name, age, gender, height_cm, description, photo_path, status, last_seen_at, last_seen_address, last_seen_lat, last_seen_lng, created_at, found_at')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        setCase(data)
        setLoading(false)
      })
  }, [id])

  if (loading) return <p className="text-muted text-sm">{t('common.loading')}</p>
  if (!c) {
    return (
      <div className="bk-sheet text-center space-y-2">
        <p>{t('case.notAvailable')}</p>
        <Link to="/" className="text-brand-700 underline">{t('common.goHome')}</Link>
      </div>
    )
  }

  // Dates written the local way, e.g. "26/11/2026, 9:30 pm" or the Hindi equivalent
  const date = new Date(c.last_seen_at).toLocaleString(dateLocale(i18n.language))

  // How long it took to find them, in hours or days
  const foundAfter = c.found_at && (() => {
    const hours = Math.max(1, Math.round((new Date(c.found_at) - new Date(c.created_at)) / 3600000))
    return hours < 48 ? `${hours} ${t('time.shortHours')}` : `${Math.round(hours / 24)} ${t('time.shortDays')}`
  })()

  return (
    <div className="space-y-4">
      {/* Found: a "Reunited" panel at the top */}
      {c.status === 'found' && (
        <section className="bk-panel overflow-hidden">
          <img src="/art/caring-hands.webp" alt="" className="photo-bg opacity-70" />
          <div className="photo-shade" aria-hidden="true" />
          <span className="bk-chip bk-chip-blue">🎉 {t('reunited.chip')}</span>
          <h2 className="relative text-[1.9rem] leading-tight tracking-[-0.02em] text-sky-ink mt-3 max-w-[70%]">
            {t('reunited.title', { name: c.full_name })}
          </h2>
          {foundAfter && <p className="bk-num text-2xl mt-2">{t('reunited.after', { time: foundAfter })}</p>}
          <p className="text-sm text-white/75 mt-2">{t('reunited.thanks')}</p>
        </section>
      )}

      <section className="bk-sheet space-y-3">
        <img src={casePhotoUrl(c.photo_path)} alt={c.full_name}
          className="w-full max-h-96 object-contain rounded-lg bg-slate-100" />
        <div>
          <h2 className="bk-liquid bk-title">
            {c.full_name}{c.age != null && <span className="font-normal text-muted">, {c.age}</span>}
          </h2>
          <StatusBadge status={c.status} />
        </div>
        <p className="text-sm">
          <Trans i18nKey="case.lastSeenLine" values={{ ago: timeAgo(c.last_seen_at), date }}
            components={{ b: <strong /> }} />
          {c.last_seen_address && (
            <Trans i18nKey="case.near" values={{ place: c.last_seen_address }} components={{ b: <strong /> }} />
          )}
        </p>
        <p className="text-sm text-muted">
          {[c.gender && t(`gender.${c.gender}`), c.height_cm && `${c.height_cm} cm`].filter(Boolean).join(' · ')}
        </p>
        {c.description && <p className="text-sm whitespace-pre-line">{c.description}</p>}
      </section>

      {c.status === 'active' && (
        <Link to={`/report?case=${c.id}`}
          className="w-full bk-btn bk-btn-orange !py-4 !text-sm">
          {t('case.iSawThem')}
        </Link>
      )}
      {c.status === 'active' && <SharePosterButton c={c} />}

      <section className="bk-sheet">
        <h3 className="font-semibold mb-2 text-sm">{t('case.lastSeenLocation')}</h3>
        <Suspense fallback={<div className="h-64 rounded-lg bg-slate-100" />}>
          <LocationPicker value={{ lat: c.last_seen_lat, lng: c.last_seen_lng }} readOnly />
        </Suspense>
      </section>

      <CaseTimeline caseId={c.id} />

      <p className="text-xs text-muted text-center">
        <Trans i18nKey="case.emergency" components={{ link: <a href="tel:112" className="underline" /> }} />
      </p>
    </div>
  )
}
