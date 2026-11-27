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
    { to: '/', label: t('nav.home'), icon: '🏠' },
    { to: '/map', label: t('nav.map'), icon: '🗺️' },
    { to: '/report', label: t('nav.report'), icon: '📍' },
    session
      ? { to: '/profile', label: t('nav.profile'), icon: '👤' }
      : { to: '/login', label: t('nav.login'), icon: '👤' },
  ]

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Top bar. "sticky top-0" keeps it on screen while you scroll. */}
      <header
        className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-2.5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.625rem)' }}
      >
        <div className="flex items-center justify-between gap-2 max-w-xl mx-auto">
          {/* Logo + name. Tapping it goes back to Home. */}
          <NavLink to="/" className="flex items-center gap-2 min-w-0">
            <img src="/favicon.svg" alt="" width="34" height="34" className="w-[34px] h-[34px] shrink-0" />
            {/* The name fades from the logo's orange to its blue */}
            <h1 className="text-xl font-extrabold tracking-tight truncate bg-gradient-to-r from-flame-500 to-brand-600 bg-clip-text text-transparent">
              {t('app.title')}
            </h1>
          </NavLink>
          {/* Language switch: shows the OTHER language's name */}
          <button onClick={toggleLanguage}
            className="shrink-0 border border-brand-100 text-brand-700 rounded-full px-3 py-1 text-sm font-medium active:bg-brand-50">
            {t('app.switchLanguage')}
          </button>
        </div>
      </header>

      {/* The current page appears here. Extra space at the bottom (pb-24)
          stops the bottom menu from covering the content. */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-24">
        <Outlet />
      </main>

      {/* Bottom menu. It stays fixed to the bottom of the screen. */}
      <nav
        className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="flex max-w-xl mx-auto">
          {menuItems.map((item) => (
            <li key={item.to} className="flex-1">
              {/* NavLink knows which page is open and highlights it in blue.
                  "end" means Home is only highlighted on exactly "/". */}
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  'flex flex-col items-center py-2 text-xs ' +
                  (isActive ? 'text-brand-700 font-semibold' : 'text-slate-500')
                }
              >
                <span className="text-xl" aria-hidden="true">{item.icon}</span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
