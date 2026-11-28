// QuickLinks.jsx: the Home shortcuts, using two design rules:
//   FREQUENCY OF USE - the shortcuts you tap most move to the top (counted on
//                      this phone only, never sent anywhere).
//   HICK'S LAW       - fewer choices = faster decisions: only the top 3 show;
//                      the rest wait behind "More".

import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import Icon from './Icons'

const KEY = 'lumen-link-use'
const SHOW = 3

function readCounts() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}

export default function QuickLinks() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [counts] = useState(readCounts) // order is fixed while you're on the page (no jumping)

  const links = [
    { to: '/who-is-this', icon: 'scan', title: t('home.whoShort'), sub: t('home.whoShortText') },
    { to: '/found-someone', icon: 'users', title: t('found.rowTitle'), sub: t('found.rowText') },
    { to: '/safety-card', icon: 'scan', title: t('safety.rowTitle'), sub: t('safety.rowText') },
    { to: '/map', icon: 'map', title: t('home.mapShort') },
  ]
  // most used first; ties keep the normal order
  const sorted = links
    .map((l, i) => ({ ...l, i, n: counts[l.to] || 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
  const shown = open ? sorted : sorted.slice(0, SHOW)
  const hidden = sorted.length - SHOW

  function count(to) {
    const c = readCounts()
    c[to] = (c[to] || 0) + 1
    try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col gap-3 stagger">
      {shown.map((l, idx) => (
        <Link key={l.to} to={l.to} onClick={() => count(l.to)} className="bk-row" style={{ '--i': idx }}>
          <span className="flex items-center gap-3">
            <span className="icon-circle"><Icon name={l.icon} className="w-5 h-5" /></span>
            <span>{l.title}{l.sub && <span className="text-muted text-sm"> · {l.sub}</span>}</span>
          </span>
          <Icon name="chevron" className="w-5 h-5 text-white/70" />
        </Link>
      ))}
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="self-center glass-pill text-xs font-semibold px-4 py-2">
          <span key={open ? 'less' : 'more'} className="icon-swap inline-block">
            {open ? `▴ ${t('home.less')}` : `▾ ${t('home.more', { count: hidden })}`}
          </span>
        </button>
      )}
    </div>
  )
}
