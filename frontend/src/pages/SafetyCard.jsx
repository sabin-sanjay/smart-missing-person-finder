// SafetyCard.jsx: make a QR safety card for a child or an elderly person.
// Print it, or save it on their phone / put it in their bag or wallet.
// If they get lost, anyone who scans it sees their family's number (page /sos).
// Nothing is stored on our servers: the details live only inside the QR code.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { drawCard } from '../lib/safetyCard'

export default function SafetyCard() {
  const { t } = useTranslation()
  const [card, setCard] = useState({ name: '', age: '', guardian: '', phone: '', phone2: '', note: '' })
  const [image, setImage] = useState('')   // the finished card picture
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setCard((c) => ({ ...c, [key]: e.target.value }))

  async function make(e) {
    e.preventDefault()
    setError('')
    if (!card.name.trim() || !/^[+\d][\d\s-]{6,}$/.test(card.phone.trim())) return setError(t('safety.errRequired'))
    setBusy(true)
    const clean = Object.fromEntries(Object.entries(card).map(([k, v]) => [k, String(v).trim()]))
    const blob = await drawCard(clean, {
      title: t('safety.cardTitle'), scan: t('safety.cardScan'), call: t('safety.cardCall'), emergency: t('safety.cardEmergency'),
    })
    setImage(URL.createObjectURL(blob))
    setBusy(false)
  }

  function print() {
    const w = window.open('')
    if (!w) return
    w.document.write(`<img src="${image}" style="width:85.6mm;height:54mm" onload="window.print()">`)
  }

  return (
    <div className="space-y-4">
      <h2 className="bk-liquid bk-title">{t('safety.title')}</h2>
      <p className="text-sm text-white/75 px-1">{t('safety.intro')}</p>

      <form onSubmit={make} className="bk-sheet space-y-3">
        <input className="bk-input" placeholder={t('safety.name')} value={card.name} onChange={set('name')} maxLength={40} />
        <input className="bk-input" placeholder={t('safety.age')} value={card.age} onChange={set('age')} inputMode="numeric" maxLength={3} />
        <input className="bk-input" placeholder={t('safety.guardian')} value={card.guardian} onChange={set('guardian')} maxLength={40} />
        <input className="bk-input" placeholder={t('safety.phone')} value={card.phone} onChange={set('phone')} inputMode="tel" maxLength={16} />
        <input className="bk-input" placeholder={t('safety.phone2')} value={card.phone2} onChange={set('phone2')} inputMode="tel" maxLength={16} />
        <textarea className="bk-input" rows="2" placeholder={t('safety.note')} value={card.note} onChange={set('note')} maxLength={160} />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={busy} className="w-full bk-btn bk-btn-orange !py-4">{t('safety.make')}</button>
        <p className="text-xs text-white/60">🔒 {t('safety.privacy')}</p>
      </form>

      {image && (
        <section className="space-y-3">
          <img src={image} alt={t('safety.cardTitle')} className="w-full rounded-[1.4rem] border border-white/20" />
          <div className="grid grid-cols-2 gap-2">
            <a href={image} download={`safety-card-${card.name || 'lumen'}.png`} className="bk-btn bk-btn-orange">{t('safety.download')}</a>
            <button type="button" onClick={print} className="bk-btn bk-btn-ghost">{t('safety.print')}</button>
          </div>
        </section>
      )}
    </div>
  )
}
