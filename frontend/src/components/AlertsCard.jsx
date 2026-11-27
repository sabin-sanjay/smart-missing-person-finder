// AlertsCard.jsx: the "🔔 Alerts near you" card on the Home page.

import { useState } from 'react'
import { Link } from 'react-router'
import { Trans, useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { enableAlerts, disableAlerts, getSavedAlertState } from '../lib/push'
import Icon from './Icons'

export default function AlertsCard({ className = '' }) {
  const { t } = useTranslation()
  const { session, profile } = useAuth()
  const [state, setState] = useState(getSavedAlertState()) // null = alerts off
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('') // already translated text
  const [isError, setIsError] = useState(false)

  async function turnOn() {
    setBusy(true)
    setMessage('')
    // enableAlerts returns a "code" (e.g. "noLocation"); we turn it into words here
    const result = await enableAlerts({ isLoggedIn: Boolean(session) })
    setIsError(!result.ok)
    setMessage(t(`alerts.msg.${result.code}`, { detail: result.detail }))
    if (result.ok) setState(getSavedAlertState())
    setBusy(false)
  }

  async function turnOff() {
    setBusy(true)
    await disableAlerts()
    setState(null)
    setIsError(false)
    setMessage(t('alerts.offDone'))
    setBusy(false)
  }

  // SMS mode but no phone number saved: warn them
  const smsWithoutPhone = state?.mode === 'sms' && session && !profile?.phone

  return (
    // A dark panel. Home puts it inside a joined "stack" of panels.
    <section className={`bk-panel overflow-hidden ${className}`}>
      {/* photo: a busy Indian street (the people who could help nearby) */}
      <img src="/art/crowd.webp" alt="" className="photo-bg opacity-60" />
      <div className="photo-shade" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg text-sky-ink">{t('alerts.statTitle')}</p>
          <p className="text-[0.8rem] text-white/60 mt-0.5">{t('alerts.intro').split('.')[0]}.</p>
        </div>
        <span className={`bk-chip ${state ? 'bk-chip-blue' : ''}`}>
          <Icon name="bell" className="w-3.5 h-3.5" strokeWidth={2.2} />
          {state ? (state.mode === 'push' ? 'Push' : 'SMS') : t('alerts.statOff')}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 mt-4">
        <p className="bk-num text-6xl leading-none">
          {state ? t('alerts.statOn') : t('alerts.statOff')}
        </p>
        {state ? (
          <button onClick={turnOff} disabled={busy} className="bk-btn bk-btn-ghost">{t('alerts.turnOff')}</button>
        ) : (
          <button onClick={turnOn} disabled={busy} className="bk-btn bk-btn-orange">
            {busy ? t('alerts.turningOn') : t('alerts.turnOn')}
          </button>
        )}
      </div>

      {smsWithoutPhone && (
        <p className="text-xs text-tangerine mt-3">
          {/* <Trans> lets a link sit inside translated text, in the right place for each language */}
          <Trans i18nKey="alerts.addPhone" components={{ link: <Link to="/profile" className="underline" /> }} />
        </p>
      )}
      {message && <p className={`text-xs mt-3 ${isError ? 'text-tangerine' : 'text-white/70'}`}>{message}</p>}
    </section>
  )
}
