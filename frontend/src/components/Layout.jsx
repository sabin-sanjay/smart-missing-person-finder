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
      {/* Soft orange + blue glows behind every page */}
      <div className="lq-backdrop" aria-hidden="true" />

      {/* Top bar: round logo button | "Lumen" | round language button.
          "sticky top-0" keeps it on screen while you scroll. */}
      <header
        className="sticky top-0 z-10 px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.6rem)' }}
      >
        <div className="flex items-center justify-between gap-2 max-w-xl mx-auto">
          <NavLink to="/" className="lq-icon-btn lq-glass" aria-label={t('nav.home')}>
            <img src="/favicon.svg" alt="" width="30" height="30" className="w-[30px] h-[30px] rounded-[9px]" />
          </NavLink>
          {/* The name fades from the logo's orange to its blue */}
          <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] bg-gradient-to-r from-flame-500 via-violet-glow to-brand-600 bg-clip-text text-transparent">
            {t('app.title')}
          </h1>
          {/* Language switch: shows the OTHER language (short form) */}
          <button onClick={toggleLanguage} className="lq-icon-btn lq-glass text-sm font-medium text-slate-700"
            aria-label={t('app.switchLanguage')}>
            {i18n.language === 'hi' ? 'EN' : 'हि'}
          </button>
        </div>
      </header>

      {/* The current page appears here. Extra space at the bottom (pb-28)
          stops the floating menu from covering the content. */}
      <main className="relative z-[1] flex-1 w-full max-w-xl mx-auto px-4 pt-2 pb-28">
        <Outlet />
      </main>

      {/* Bottom menu: a floating glass pill. The open page gets a black bubble. */}
      <nav
        className="fixed inset-x-0 bottom-0 px-4 z-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <ul className="lq-glass flex max-w-md mx-auto rounded-full p-1.5">
          {menuItems.map((item) => (
            <li key={item.to} className="flex-1">
              {/* NavLink knows which page is open. "end" = Home only on exactly "/". */}
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  'flex flex-col items-center gap-0.5 rounded-full py-2 text-[11px] transition-colors ' +
                  (isActive ? 'bg-ink text-white' : 'text-muted active:bg-slate-100')
                }
              >
                <Icon name={item.icon} className="w-[22px] h-[22px]" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
