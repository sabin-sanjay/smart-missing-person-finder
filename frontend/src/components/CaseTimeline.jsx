// CaseTimeline.jsx: the story of a case, top to bottom:
//   Reported -> Approved -> Alerts at 2 / 5 / 10 km -> Sightings -> Found
// The data comes from the database function case_timeline (see supabase/011),
// which only gives out times and counts, never who was alerted or who reported.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

const DOTS = {
  reported: 'bg-sky-ink',
  approved: 'bk-btn-ink',
  alerts: 'bk-liquid-orange',
  sighting: 'bg-tangerine',
  found: 'bg-ink',
}

export default function CaseTimeline({ caseId }) {
  const { t, i18n } = useTranslation()
  const [events, setEvents] = useState(null)

  useEffect(() => {
    supabase.rpc('case_timeline', { p_case: caseId }).then(({ data }) => setEvents(data ?? []))
  }, [caseId])

  if (!events || events.length === 0) return null

  // Many sightings would make the list very long: show at most 5 of them
  let sightingsShown = 0
  const sightingsTotal = events.filter((e) => e.kind === 'sighting').length
  const list = events.filter((e) => e.kind !== 'sighting' || ++sightingsShown <= 5)

  const when = (iso) => new Date(iso).toLocaleString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN',
    { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  return (
    <section className="bk-sheet">
      <h3 className="text-lg mb-3">{t('timeline.title')}</h3>
      <ol className="relative">
        {list.map((e, i) => (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {/* the line joining the dots */}
            {i < list.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-[2px] bg-ink/12" aria-hidden="true" />}
            <span className={`relative mt-1 w-4 h-4 rounded-full shrink-0 ring-4 ring-[#fffafa] ${DOTS[e.kind] || 'bg-ink/30'}`} />
            <div className="min-w-0">
              <p className="text-[15px] leading-snug">
                {e.kind === 'alerts'
                  ? t('timeline.alerts', { km: e.radius_km, count: e.people })
                  : t(`timeline.${e.kind}`)}
              </p>
              <p className="font-mono text-xs text-muted">{when(e.at)}</p>
            </div>
          </li>
        ))}
      </ol>
      {sightingsTotal > 5 && (
        <p className="text-xs text-muted mt-2">{t('timeline.moreSightings', { count: sightingsTotal - 5 })}</p>
      )}
    </section>
  )
}
