// SharePosterButton.jsx: "Share poster" button for a case.
// Makes a MISSING poster picture (with a QR code to the case page) and opens the
// phone's share menu (WhatsApp, Instagram, etc.). If the phone can't share pictures,
// it downloads the poster instead and copies the case link.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function SharePosterButton({ c, className = '' }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function share() {
    setBusy(true)
    setMessage('')
    try {
      // Only download the poster maker (and QR code) when it's actually needed
      const { makePoster } = await import('../lib/casePoster.js')
      const url = `${window.location.origin}/case/${c.id}`
      const blob = await makePoster(c, {
        missing: t('poster.missing'),
        helpFind: t('poster.helpFind'),
        lastSeen: t('poster.lastSeen'),
        seen: t('poster.seen'),
        scan: t('poster.scan'),
        emergency: t('poster.emergency'),
        gender: c.gender ? t(`gender.${c.gender}`) : '',
      }, url)
      const fileName = `lumen-missing-${c.full_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.jpg`
      const file = new File([blob], fileName, { type: 'image/jpeg' })
      const text = t('poster.shareText', { name: c.full_name, place: c.last_seen_address || '—', url })

      if (navigator.canShare?.({ files: [file] })) {
        // The phone's own share menu: WhatsApp, Instagram, Telegram...
        await navigator.share({ files: [file], title: t('poster.missing'), text })
      } else {
        // Computer or older phone: download the picture and copy the link
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = fileName
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 5000)
        await navigator.clipboard?.writeText(text).catch(() => {})
        setMessage(t('poster.downloaded'))
      }
    } catch (err) {
      // Closing the share menu is not an error
      if (err?.name !== 'AbortError') setMessage(t('poster.failed'))
    }
    setBusy(false)
  }

  return (
    <div className={className}>
      <button onClick={share} disabled={busy} className="w-full bk-btn bk-btn-line">
        {busy ? t('poster.making') : t('poster.share')}
      </button>
      {message && <p className="text-xs text-muted text-center mt-2">{message}</p>}
    </div>
  )
}
