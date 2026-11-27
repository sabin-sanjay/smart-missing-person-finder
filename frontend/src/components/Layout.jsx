// Layout.jsx
// The frame that wraps every page:
//   - a top bar with the app name
//   - the current page in the middle (<Outlet /> is where it appears)
//   - a bottom menu, easy to reach with your thumb on a phone

import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { refreshAlertLocation, listenForForegroundAlerts } from '../lib/push'
import Icon from './Icons'

export default function Layout() {
  const { session } = useAuth()
  const { t, i18n } = useTranslation() // t('nav.home') -> "Home" or "होम"

  // Switch English <-> Hindi. If logged in, also save it to the profile.
  function toggleLanguage() {
    const next = i18n.language === 'hi' ? 'en' : 'hi'
    i18n.changeLanguage(next)
    if (session) {
      supabase.from('profiles').update({ preferred_language: next }).eq('id', session.user.id).then(() => {})
    }
  }

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
        className="sticky top-0 z-10 px-3 pb-2 bg-paper"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.6rem)' }}
      >
        <div className="bk-panel !py-3.5 flex items-center justify-between gap-2 max-w-xl mx-auto">
          <NavLink to="/" className="flex items-center gap-2.5 min-w-0" aria-label={t('nav.home')}>
            <img src="/favicon.svg" alt="" width="32" height="32" className="w-8 h-8 rounded-[10px]" />
            <span className="text-[1.45rem] font-light tracking-[-0.03em] text-white">
              {t('app.title')}<sup className="text-[0.55em] text-tangerine ml-0.5">●</sup>
            </span>
          </NavLink>
          {/* Language switch: shows the OTHER language */}
          <button onClick={toggleLanguage} className="bk-chip bk-chip-blue !text-xs !px-2.5 !py-1.5">
            {t('app.switchLanguage')}
          </button>
        </div>
      </header>

      {/* The current page appears here. Extra space at the bottom (pb-28)
          stops the menu from covering the content. */}
      <main className="relative z-[1] flex-1 w-full max-w-xl mx-auto px-3 pt-1 pb-28">
        <Outlet />
      </main>

      {/* Bottom menu: a black pill. The open page is an orange pill inside it. */}
      <nav
        className="fixed inset-x-0 bottom-0 px-3 z-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.7rem)' }}
      >
        <ul className="flex max-w-md mx-auto rounded-full p-1.5 bk-liquid">
          {menuItems.map((item) => (
            <li key={item.to} className="flex-1">
              {/* NavLink knows which page is open. "end" = Home only on exactly "/". */}
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  'font-mono flex flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-semibold uppercase tracking-[0.04em] transition-colors ' +
                  (isActive ? 'bk-liquid-orange' : 'text-white/80 active:bg-white/10')
                }
              >
                <Icon name={item.icon} className="w-[21px] h-[21px]" strokeWidth={1.8} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
