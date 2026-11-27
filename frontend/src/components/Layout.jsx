// Layout.jsx
// The frame that wraps every page:
//   - a top bar with the app name
//   - the current page in the middle (<Outlet /> is where it appears)
//   - a bottom menu, easy to reach with your thumb on a phone

import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { refreshAlertLocation, listenForForegroundAlerts } from '../lib/push'
import Icon from './Icons'
import TabNav from './TabNav'
import { LANGUAGES, LANGUAGE_NAMES } from '../i18n'

export default function Layout() {
  const { session } = useAuth()
  const { t, i18n } = useTranslation() // t('nav.home') -> "Home" or "होम"

  // Change the language. If logged in, also save it to the profile.
  function changeLanguage(next) {
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

  // Which menu tab is open (-1 = a page that isn't in the menu, e.g. a case page)
  const { pathname } = useLocation()
  const activeTab = menuItems.findIndex((m) => (m.to === '/' ? pathname === '/' : pathname.startsWith(m.to)))

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
        <div className="bk-panel !py-3.5 flex items-center justify-between gap-3 max-w-xl md:max-w-4xl mx-auto">
          <NavLink to="/" className="flex items-center gap-2.5 min-w-0" aria-label={t('nav.home')}>
            <img src="/favicon.svg" alt="" width="32" height="32" className="w-8 h-8 rounded-[10px]" />
            <span className="text-[1.45rem] font-light tracking-[-0.03em] text-white">
              {t('app.title')}<sup className="text-[0.55em] text-tangerine ml-0.5">●</sup>
            </span>
          </NavLink>
          {/* Tablets and computers: the menu sits here, in the top bar */}
          <nav className="hidden md:block flex-1 max-w-md" aria-label="Main menu">
            <TabNav items={menuItems} active={activeTab} variant="top" />
          </nav>
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
      <main className="relative z-[1] flex-1 w-full max-w-xl md:max-w-2xl mx-auto px-3 md:px-5 pt-1 md:pt-4 pb-28 md:pb-12">
        <Outlet />
      </main>

      {/* Phones: the menu is a glass tab bar at the bottom (hidden on bigger screens) */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 px-4 z-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        aria-label="Main menu"
      >
        <TabNav items={menuItems} active={activeTab} variant="bottom" className="max-w-md mx-auto" />
      </nav>
    </div>
  )
}
