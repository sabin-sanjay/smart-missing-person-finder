// Sos.jsx: the page that opens when someone scans a Lumen safety card.
// Works for anyone (no login, no app needed): shows the person's name, big
// buttons to call their family, the note, and 112.

import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { readCard } from '../lib/safetyCard'

export default function Sos() {
  const { t } = useTranslation()
  const card = readCard(window.location.hash)

  if (!card) {
    return <p className="bk-sheet text-sm">{t('sos.invalid')}</p>
  }

  const tel = (n) => `tel:${n.replace(/[^\d+]/g, '')}`

  return (
    <div className="space-y-4">
      <section className="bk-panel text-center !py-7">
        <span className="badge badge-red">{t('safety.cardTitle')}</span>
        <h2 className="text-[1.9rem] leading-tight mt-3">{t('sos.title')}</h2>
        <p className="text-2xl font-semibold mt-3">{card.name}{card.age ? `, ${card.age}` : ''}</p>
        {card.note && <p className="text-sm text-white/80 mt-2">{card.note}</p>}
      </section>

      <a href={tel(card.phone)} data-haptic="strong" className="call-tile call-tile-red !items-center !py-5">
        <span className="call-num">📞 {card.phone}</span>
        <span className="call-label">{t('sos.callFamily')}{card.guardian ? ` · ${card.guardian}` : ''}</span>
      </a>
      {card.phone2 && (
        <a href={tel(card.phone2)} className="bk-btn bk-btn-ghost w-full !py-4">📞 {card.phone2}</a>
      )}
      <a href="tel:112" className="bk-btn bk-btn-ghost w-full !py-4">🆘 {t('sos.call112')}</a>
      <Link to="/found-someone" className="bk-btn bk-btn-ghost w-full !py-4">🧍 {t('sos.registerFound')}</Link>
      <p className="text-xs text-white/60 text-center px-4">{t('sos.stay')}</p>
    </div>
  )
}
