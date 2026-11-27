// Home.jsx: the first page people see ("liquid glass" design).
// It loads the latest APPROVED (active) cases from the Supabase database.
// The security rules decide what comes back. Pending cases are never shown here.
// All visible words come from the translation files (t('home.…')).
//
// Layout, top to bottom:
//   1. Quick search pill (filters the cases by name or place, on the phone)
//   2. A sideways row of big stat cards: missing now / alerts / "Who is this?"
//   3. Filter pills: All / Last 24 h / Children (the selected one is black)
//   4. A sideways row of colourful "liquid" case cards
//   5. Two big buttons: Report a sighting / Live map

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase, isSupabaseConfigured, casePhotoUrl } from '../lib/supabase'
import AlertsCard from '../components/AlertsCard'
import Icon from '../components/Icons'

// "How long missing" as a big number + small unit, e.g. { value: 5, unit: 'h' }
function missingFor(dateString, t) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(dateString).getTime()) / 60000))
  if (minutes < 60) return { value: minutes, unit: t('time.shortMin') }
  const hours = Math.round(minutes / 60)
  if (hours < 48) return { value: hours, unit: t('time.shortHours') }
  return { value: Math.round(hours / 24), unit: t('time.shortDays') }
}

// The filter pills. Each one is a test that a case must pass.
const FILTERS = {
  all: () => true,
  recent: (c) => Date.now() - new Date(c.last_seen_at).getTime() < 24 * 60 * 60 * 1000,
  children: (c) => c.age != null && c.age < 18,
}

export default function Home() {
  const { t } = useTranslation()
  const [cases, setCases] = useState([])     // the list of cases
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')   // text typed in the search pill
  const [filter, setFilter] = useState('all') // which pill is selected

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
        .select('id, full_name, age, gender, photo_path, last_seen_at, last_seen_address')
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

  // The cases that match the search text and the selected pill.
  // useMemo = only re-calculate when one of these changes.
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase()
    return cases.filter((c) =>
      FILTERS[filter](c) &&
      (!words || `${c.full_name} ${c.last_seen_address ?? ''}`.toLowerCase().includes(words)),
    )
  }, [cases, search, filter])

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Quick search */}
      <label className="flex items-center gap-3 rounded-full border border-slate-900/10 bg-white/70 px-5 py-3.5">
        <Icon name="search" className="w-5 h-5 text-slate-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('home.search')}
          className="w-full bg-transparent outline-none text-[15px] placeholder:text-slate-400"
        />
      </label>

      {/* 2. Big stat cards, scroll sideways */}
      <div className="lq-rail">
        {/* Missing right now */}
        <section className="lq-card w-[16.5rem] min-h-[15rem] p-5 flex flex-col">
          <div className="flex items-start justify-between">
            <span className="lq-icon-btn relative text-slate-700">
              <Icon name="users" className="w-[22px] h-[22px]" />
              {cases.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-flame-500 text-white text-xs font-bold flex items-center justify-center">!</span>
              )}
            </span>
            <Link to="/map" className="lq-icon-btn bg-slate-100 border-transparent text-slate-600" aria-label={t('home.mapShort')}>
              <Icon name="arrow" />
            </Link>
          </div>
          <p className="mt-4 text-lg text-slate-800">{t('home.statMissing')}</p>
          <div className="mt-auto flex items-end justify-between">
            <p className="text-6xl font-light tracking-tight">
              {loading ? '–' : cases.length}
              <span className="text-lg text-slate-400 ml-1">{t('home.statMissingSub')}</span>
            </p>
          </div>
          {/* little dot pattern, like the reference */}
          <div className="lq-dots text-flame-500/50 h-5 mt-3 rounded" aria-hidden="true" />
        </section>

        {/* Alerts near you (on/off) */}
        <AlertsCard />

        {/* Who is this? (face search) */}
        <Link to="/who-is-this" className="lq-liquid-brand w-[16.5rem] min-h-[15rem] p-5 flex flex-col">
          <div className="flex items-start justify-between relative">
            <span className="lq-icon-btn border-white/40 bg-white/15 text-white">
              <Icon name="scan" className="w-[22px] h-[22px]" />
            </span>
            <span className="lq-icon-btn border-transparent bg-[#0b0b0f] text-white">
              <Icon name="arrow" />
            </span>
          </div>
          <p className="mt-4 text-lg relative">{t('home.whoShort')}</p>
          <p className="text-white/75 text-sm relative">{t('home.whoText')}</p>
          <div className="lq-dots text-white/40 h-5 mt-auto rounded relative" aria-hidden="true" />
        </Link>
      </div>

      {/* 3. Filter pills */}
      <div className="lq-rail !my-0 !py-1" role="group" aria-label={t('home.casesTitle')}>
        {Object.keys(FILTERS).map((key) => (
          <button key={key} className="lq-pill" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {t(`home.filter${key[0].toUpperCase()}${key.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* 4. Case cards. Show ONE of: loading, error, empty, or the cards */}
      {loading && <p className="text-slate-500 text-sm px-1">{t('common.loading')}</p>}
      {!loading && error && <p className="text-red-600 text-sm px-1">{error}</p>}
      {!loading && !error && cases.length === 0 && <p className="text-slate-500 text-sm px-1">{t('home.noCases')}</p>}
      {!loading && !error && cases.length > 0 && shown.length === 0 && (
        <p className="text-slate-500 text-sm px-1">{t('home.noMatch')}</p>
      )}

      {shown.length > 0 && (
        <div className="lq-rail">
          {shown.map((c, i) => {
            const gone = missingFor(c.last_seen_at, t)
            return (
              // Cards alternate orange / blue
              <Link key={c.id} to={`/case/${c.id}`}
                className={`${i % 2 ? 'lq-liquid-brand' : 'lq-liquid-flame'} w-[18.5rem] p-5 flex flex-col gap-4`}>
                {/* Photo in a ring, name, arrow button */}
                <div className="flex items-center gap-3 relative">
                  <span className="w-16 h-16 rounded-full p-[3px] bg-white/30 ring-2 ring-white/70 shrink-0">
                    <img src={casePhotoUrl(c.photo_path)} alt={c.full_name} loading="lazy"
                      className="w-full h-full rounded-full object-cover bg-white/40" />
                  </span>
                  <p className="text-xl leading-tight min-w-0 flex-1">
                    <span className="block truncate">{c.full_name}</span>
                    {c.age != null && <span className="text-white/70 text-base">{c.age}</span>}
                  </p>
                  <span className="lq-icon-btn border-transparent bg-[#0b0b0f] text-white">
                    <Icon name="arrow" />
                  </span>
                </div>

                {/* How long missing + where last seen */}
                <div className="flex items-end justify-between gap-3 relative">
                  <div>
                    <p className="text-white/70 text-sm">{t('home.missingFor')}</p>
                    <p className="text-5xl font-light tracking-tight">
                      {gone.value}<span className="text-lg ml-1">{gone.unit}</span>
                    </p>
                  </div>
                  <div className="text-right min-w-0">
                    <p className="text-white/70 text-sm">{t('home.lastSeenLabel')}</p>
                    <p className="text-sm truncate max-w-[8.5rem]">{c.last_seen_address || t('home.locationOnMap')}</p>
                  </div>
                </div>

                <div className="lq-dots text-white/45 h-5 rounded relative" aria-hidden="true" />
                <p className="text-white/85 text-sm relative">{t('home.seenThem')} →</p>
              </Link>
            )
          })}
        </div>
      )}

      {/* 5. The two main actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/report" className="lq-liquid-flame px-4 py-5 flex flex-col gap-3">
          <Icon name="pin" className="w-7 h-7 relative" />
          <span className="font-medium relative">{t('home.reportShort')}</span>
        </Link>
        <Link to="/map" className="lq-card px-4 py-5 flex flex-col gap-3 text-slate-900">
          <Icon name="map" className="w-7 h-7 text-brand-700" />
          <span className="font-medium">{t('home.mapShort')}</span>
        </Link>
      </div>
    </div>
  )
}
