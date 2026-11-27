// Layout.jsx
// The frame that wraps every page:
//   - a top bar with the app name
//   - the current page in the middle (<Outlet /> is where it appears)
//   - a bottom menu, easy to reach with your thumb on a phone

import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { refreshAlertLocation, listenForForegroundAlerts, syncAlertLanguage } from '../lib/push'
import Icon from './Icons'
import { flushQueue, pendingCount, onQueueChange } from '../lib/offlineQueue'
import { LANGUAGES, LANGUAGE_NAMES } from '../i18n'

export default function Layout() {
  const { session } = useAuth()
  const { t, i18n } = useTranslation() // t('nav.home') -> "Home" or "होम"

  // Change the language. If logged in, also save it to the profile.
  function changeLanguage(next) {
    i18n.changeLanguage(next)
    syncAlertLanguage(next) // notifications in the new language too
    if (session) {
      supabase.from('profiles').update({ preferred_language: next }).eq('id', session.user.id).then(() => {})
    }
  }

  // Sighting reports saved without internet: send them when the internet is back
  const [waiting, setWaiting] = useState(0)
  useEffect(() => {
    const update = () => pendingCount().then(setWaiting)
    const send = () => { if (session) flushQueue().then(update) }
    update()
    send()
    window.addEventListener('online', send)
    const stop = onQueueChange(update)
    return () => { window.removeEventListener('online', send); stop() }
  }, [session])

  // When the app opens: if alerts are on, update this phone's location
  // (at most every 30 min) and show alerts that arrive while the app is open.
  useEffect(() => {
    refreshAlertLocation()
    listenForForegroundAlerts()
  }, [])

  // The items in the bottom menu. To add a menu item later, add a line here.
  // The last item shows "Login" or "Profile" depending on whether you're logged in.
  const menuItems = [
    { to: '/', label: t('nav.home'), icon: 'home' },
    { to: '/map', label: t('nav.map'), icon: 'map' },
    { to: '/report', label: t('nav.report'), icon: 'pin' },
    session
      ? { to: '/profile', label: t('nav.profile'), icon: 'user' }
      : { to: '/login', label: t('nav.login'), icon: 'user' },
  ]

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Plain off-white page behind everything */}
      <div className="lq-backdrop" aria-hidden="true" />

      {/* Top bar: a dark rounded panel with logo + name, and a blue language chip.
          "sticky top-0" keeps it on screen while you scroll. */}
      <header
        className="sticky top-0 z-10 px-3 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.6rem)' }}
      >
        <div className="bk-panel !py-3.5 flex items-center justify-between gap-2 max-w-xl mx-auto">
          <NavLink to="/" className="flex items-center gap-2.5 min-w-0" aria-label={t('nav.home')}>
            <img src="/favicon.svg" alt="" width="32" height="32" className="w-8 h-8 rounded-[10px]" />
            <span className="text-[1.45rem] font-light tracking-[-0.03em] text-white">
              {t('app.title')}<sup className="text-[0.55em] text-tangerine ml-0.5">●</sup>
            </span>
          </NavLink>
          {/* Language menu: the phone's own list pops up (easy on small screens).
              The list itself is dark with white text so every language is readable. */}
          <label className="relative glass-pill text-xs font-semibold px-3.5 py-2 flex items-center gap-1.5">
            <Icon name="globe" className="w-4 h-4" />
            <span aria-hidden="true">{LANGUAGE_NAMES[i18n.resolvedLanguage] ?? 'English'}</span>
            <span aria-hidden="true" className="opacity-70">▾</span>
            <select
              value={i18n.resolvedLanguage}
              onChange={(e) => changeLanguage(e.target.value)}
              aria-label="Language"
              className="lang-select absolute inset-0 opacity-0 cursor-pointer"
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>{LANGUAGE_NAMES[code]}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* The current page appears here. Extra space at the bottom (pb-28)
          stops the menu from covering the content. */}
      <main className="relative z-[1] flex-1 w-full max-w-xl mx-auto px-3 pt-1 pb-28">
        {waiting > 0 && (
          <div className="bk-row !rounded-2xl !p-3 mb-3 text-sm">
            <span>📶 {t('report.queued', { count: waiting })}</span>
            <button type="button" onClick={() => flushQueue().then(() => pendingCount().then(setWaiting))}
              className="bk-btn bk-btn-ghost !py-2 !px-3 !text-xs">{t('report.sendNow')}</button>
          </div>
        )}
        <Outlet />
      </main>

      {/* Bottom menu (like the reference): a black glass bar holding round
          glass buttons. The open page becomes a white pill with its name. */}
      <nav
        className="fixed inset-x-0 bottom-0 px-3 z-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.7rem)' }}
      >
        <ul className="nav-bar flex items-center gap-2 max-w-md mx-auto rounded-full p-1.5">
          {menuItems.map((item) => (
            <li key={item.to} className="contents">
              {/* NavLink knows which page is open. "end" = Home only on exactly "/". */}
              <NavLink
                to={item.to}
                end={item.to === '/'}
                aria-label={item.label}
                className={({ isActive }) =>
                  'flex items-center justify-center gap-2 h-12 rounded-full text-sm font-semibold transition-all ' +
                  (isActive ? 'nav-active flex-1 px-4' : 'nav-circle w-12 shrink-0')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon name={item.icon} className="w-[20px] h-[20px]" strokeWidth={1.9} />
                    {isActive && <span>{item.label}</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
