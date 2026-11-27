// Home.jsx: the first page people see.
// It loads the latest APPROVED (active) cases from the Supabase database.
// The security rules decide what comes back. Pending cases are never shown here.
// All visible words come from the translation files (t('home.…')).

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase, isSupabaseConfigured, casePhotoUrl } from '../lib/supabase'
import { timeAgo } from '../lib/dates'
import AlertsCard from '../components/AlertsCard'

export default function Home() {
  const { t } = useTranslation()
  const [cases, setCases] = useState([])     // the list of cases
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // useEffect runs this code once, when the page first opens.
  useEffect(() => {
    async function loadCases() {
      if (!isSupabaseConfigured) {
        setError('Database not connected yet. Fill in frontend/.env and restart the app.')
        setLoading(false)
        return
      }

      // Ask the database: the 20 newest active cases, with only the columns we need
      // (asking for fewer columns = less data on slow internet).
      const { data, error } = await supabase
        .from('missing_persons')
        .select('id, full_name, age, gender, photo_path, last_seen_at, last_seen_address')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20)

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

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl p-4 shadow-sm ring-1 ring-slate-200/80">
        <h2 className="text-xl font-bold mb-1">{t('home.heroTitle')}</h2>
        <p className="text-slate-600 text-sm">{t('home.heroText')}</p>
      </section>

      {/* Big, easy-to-tap buttons for the two main things people do */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/report"
          className="bg-flame-600 text-white rounded-xl p-4 text-center font-semibold active:bg-flame-700">
          {t('home.reportBtn')}
        </Link>
        <Link to="/map"
          className="bg-brand-700 text-white rounded-xl p-4 text-center font-semibold active:bg-brand-800">
          {t('home.mapBtn')}
        </Link>
      </div>

      <Link to="/who-is-this" className="block bg-white rounded-xl p-4 shadow-sm ring-1 ring-slate-200/80 active:bg-slate-50">
        <p className="font-semibold">{t('home.whoTitle')}</p>
        <p className="text-sm text-slate-600">{t('home.whoText')}</p>
      </Link>

      <AlertsCard />

      <section className="bg-white rounded-xl p-4 shadow-sm ring-1 ring-slate-200/80">
        <h3 className="font-semibold mb-2">{t('home.currentlyMissing')}</h3>

        {/* Show ONE of: loading, error, empty, or the list */}
        {loading && <p className="text-slate-500 text-sm">{t('common.loading')}</p>}
        {!loading && error && <p className="text-red-600 text-sm">{error}</p>}
        {!loading && !error && cases.length === 0 && (
          <p className="text-slate-500 text-sm">{t('home.noCases')}</p>
        )}

        <ul className="space-y-3">
          {cases.map((c) => (
            <li key={c.id}>
              {/* Tapping a case opens its public page */}
              <Link to={`/case/${c.id}`} className="flex gap-3 items-center active:bg-slate-50 rounded-lg">
                {c.photo_path ? (
                  <img
                    src={casePhotoUrl(c.photo_path)}
                    alt={c.full_name}
                    loading="lazy" // only downloads the photo when it scrolls into view
                    className="w-16 h-16 rounded-lg object-cover bg-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-200 flex items-center justify-center text-2xl shrink-0">👤</div>
                )}
                <div className="text-sm min-w-0">
                  <p className="font-semibold">
                    {c.full_name}
                    {c.age != null && <span className="font-normal text-slate-500">, {c.age}</span>}
                  </p>
                  <p className="text-slate-600 truncate">
                    {t('home.lastSeen', { place: c.last_seen_address || t('home.locationOnMap') })}
                  </p>
                  <p className="text-slate-500">{timeAgo(c.last_seen_at)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
