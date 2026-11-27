// Home.jsx: the first page people see ("dark panel" design).
// It loads the latest APPROVED (active) cases from the Supabase database.
// The security rules decide what comes back. Pending cases are never shown here.
// All visible words come from the translation files (t('home.…')).
//
// Layout, top to bottom:
//   1. Joined panels: "Help bring them home." + numbers, then the alerts on/off panel
//   2. Quick search + two outlined rows: Who is this? / Live map
//   3. Filter chips: All / Last 24 h / Children
//   4. One joined pair of panels per missing person

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase, isSupabaseConfigured, casePhotoUrl } from '../lib/supabase'
import AlertsCard from '../components/AlertsCard'
import Icon from '../components/Icons'
import SlidingTabs from '../components/SlidingTabs'

const DAY = 24 * 60 * 60 * 1000

// "How long missing" as a big number + small unit, e.g. { value: 5, unit: 'h' }
function missingFor(dateString, t) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(dateString).getTime()) / 60000))
  if (minutes < 60) return { value: minutes, unit: t('time.shortMin') }
  const hours = Math.round(minutes / 60)
  if (hours < 48) return { value: hours, unit: t('time.shortHours') }
  return { value: Math.round(hours / 24), unit: t('time.shortDays') }
}

// The filter chips. Each one is a test that a case must pass.
const FILTERS = {
  all: () => true,
  recent: (c) => Date.now() - new Date(c.last_seen_at).getTime() < DAY,
  children: (c) => c.age != null && c.age < 18,
}

export default function Home() {
  const { t } = useTranslation()
  const [cases, setCases] = useState([])     // the list of cases
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')   // text typed in the search box
  const [filter, setFilter] = useState('all') // which chip is selected

  // useEffect runs this code once, when the page first opens.
  useEffect(() => {
    async function loadCases() {
      if (!isSupabaseConfigured) {
        setError('Database not connected yet. Fill in frontend/.env and restart the app.')
        setLoading(false)
        return
      }
      // The 30 newest active cases, with only the columns we need
      // (fewer columns = less data on slow internet).
      const { data, error } = await supabase
        .from('missing_persons')
        .select('id, full_name, age, gender, photo_path, last_seen_at, last_seen_address, alert_radius_km')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) {
        console.error(error)
        setError('Could not load cases: ' + error.message)
      } else {
        setCases(data)
      }
      setLoading(false)
    }
    loadCases()
  }, [])

  // The cases that match the search text and the selected chip.
  // useMemo = only re-calculate when one of these changes.
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase()
    return cases.filter((c) =>
      FILTERS[filter](c) &&
      (!words || `${c.full_name} ${c.last_seen_address ?? ''}`.toLowerCase().includes(words)),
    )
  }, [cases, search, filter])

  const newToday = cases.filter(FILTERS.recent).length

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Hero + alerts, joined by a notch */}
      <div className="bk-stack">
        <section className="bk-panel !pt-6 overflow-hidden">
          {/* decorative shapes: two glass rings in the corner */}
          <span className="shape-ring w-40 h-40 -right-16 -top-20" aria-hidden="true" />
          <span className="shape-ring shape-ring-red w-16 h-16 right-4 top-4" aria-hidden="true" />
          <span className="badge badge-live mb-3"><span className="live-dot" />{t('badges.live')}</span>
          <h2 className="text-[2.15rem] leading-[1.08] tracking-[-0.02em] text-sky-ink max-w-[85%]">
            {t('home.heroTitle')}.
          </h2>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div>
              <p className="bk-label">{t('home.statMissing')}</p>
              <p className="bk-num text-3xl mt-0.5">{loading ? '–' : cases.length}</p>
            </div>
            <div>
              <p className="bk-label">{t('home.newToday')}</p>
              <p className="bk-num text-3xl mt-0.5 text-tangerine">{loading ? '–' : newToday}</p>
            </div>
          </div>
        </section>
        <div className="bk-notch" aria-hidden="true" />
        <AlertsCard />
      </div>

      {/* 2. Search + quick links (light outlined rows) */}
      <label className="search-pill">
        <span className="icon-circle icon-circle-white"><Icon name="search" className="w-5 h-5" /></span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('home.search')}
          className="w-full bg-transparent outline-none text-[15px] text-white placeholder:text-white/60"
        />
      </label>
      <Link to="/who-is-this" className="bk-row">
        <span className="flex items-center gap-3">
          <span className="icon-circle"><Icon name="scan" className="w-5 h-5" /></span>
          <span>{t('home.whoShort')} <span className="text-muted text-sm">· {t('home.whoShortText')}</span></span>
        </span>
        <Icon name="chevron" className="w-5 h-5 text-white/70" />
      </Link>
      <Link to="/map" className="bk-row">
        <span className="flex items-center gap-3">
          <span className="icon-circle"><Icon name="map" className="w-5 h-5" /></span>
          {t('home.mapShort')}
        </span>
        <Icon name="chevron" className="w-5 h-5 text-white/70" />
      </Link>

      {/* 3. Heading + sliding filter tabs */}
      <h3 className="text-xl tracking-tight mt-3 px-1">{t('home.casesTitle')}</h3>
      <SlidingTabs
        label={t('home.casesTitle')}
        value={filter}
        onChange={setFilter}
        options={Object.keys(FILTERS).map((key) => ({
          value: key,
          label: t(`home.filter${key[0].toUpperCase()}${key.slice(1)}`),
        }))}
      />

      {/* 4. Cases. Show ONE of: loading, error, empty, or the panels */}
      {loading && <p className="text-muted text-sm px-1">{t('common.loading')}</p>}
      {!loading && error && <p className="text-red-600 text-sm px-1">{error}</p>}
      {!loading && !error && cases.length === 0 && <p className="text-muted text-sm px-1">{t('home.noCases')}</p>}
      {!loading && !error && cases.length > 0 && shown.length === 0 && (
        <p className="text-muted text-sm px-1">{t('home.noMatch')}</p>
      )}

      {shown.map((c) => {
        const gone = missingFor(c.last_seen_at, t)
        return (
          <article key={c.id} className="bk-stack">
            {/* Top panel: photo, name, "missing for" chip */}
            <Link to={`/case/${c.id}`} className="bk-panel flex items-center gap-3.5">
              <img src={casePhotoUrl(c.photo_path)} alt={c.full_name} loading="lazy"
                className="w-14 h-14 rounded-full object-cover bg-white/10 ring-2 ring-tangerine shrink-0" />
              <p className="flex-1 min-w-0 leading-tight">
                <span className="block text-xl truncate">{c.full_name}</span>
                {c.age != null && <span className="text-white/60 text-sm">{c.age}</span>}
                <span className="flex flex-wrap gap-1.5 mt-1.5">
                  {FILTERS.recent(c) && <span className="badge badge-white">{t('badges.new')}</span>}
                  {FILTERS.children(c) && <span className="badge badge-red">{t('badges.child')}</span>}
                  {c.alert_radius_km && (
                    <span className="badge"><Icon name="pin" className="w-3 h-3" strokeWidth={2} />{t('badges.km', { km: c.alert_radius_km })}</span>
                  )}
                </span>
              </p>
              <span className="bk-chip">{t('home.missingChip')}</span>
            </Link>
            <div className="bk-notch" aria-hidden="true" />
            {/* Bottom panel: details + buttons */}
            <div className="bk-panel">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="bk-label">{t('home.missingFor')}</p>
                  <p className="bk-num text-4xl leading-none mt-1 text-sky-ink">
                    {gone.value}<span className="text-base ml-1 text-white/70">{gone.unit}</span>
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="bk-label">{t('home.lastSeenLabel')}</p>
                  <p className="mt-1 text-sm truncate">{c.last_seen_address || t('home.locationOnMap')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mt-5">
                <Link to={`/report?case=${c.id}`} className="bk-btn bk-btn-orange">{t('home.reportOne')}</Link>
                <Link to={`/case/${c.id}`} className="bk-btn bk-btn-ghost">{t('home.details')}</Link>
              </div>
            </div>
          </article>
        )
      })}

      {/* 5. "Together" card: a heart in a helping hand */}
      <section className="bk-panel mt-3 overflow-hidden">
        <span className="shape-ring w-32 h-32 -right-10 -bottom-12" aria-hidden="true" />
        <span className="shape-dot w-2.5 h-2.5 right-7 bottom-7" aria-hidden="true" />
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="badge badge-white">{t('badges.free')}</span>
          <span className="badge"><Icon name="globe" className="w-3 h-3" strokeWidth={2} />{t('badges.languages')}</span>
          <span className="badge"><Icon name="lock" className="w-3 h-3" strokeWidth={2} />{t('badges.private')}</span>
        </div>
        <div>
          <h3 className="text-lg leading-snug">{t('home.togetherTitle')}</h3>
          <p className="text-[0.85rem] text-white/65 mt-1">{t('home.togetherText')}</p>
        </div>
      </section>
    </div>
  )
}
