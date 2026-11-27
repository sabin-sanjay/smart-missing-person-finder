// AlertsCard.jsx: the "🔔 Alerts near you" card on the Home page.

import { useState } from 'react'
import { Link } from 'react-router'
import { Trans, useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { enableAlerts, disableAlerts, getSavedAlertState } from '../lib/push'
import Icon from './Icons'

export default function AlertsCard() {
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
    // A big round "stat card" (sits in the sideways row on Home)
    <section className="lq-card w-[16.5rem] min-h-[15rem] p-5 flex flex-col">
      <div className="flex items-start justify-between">
        {/* Bell in a circle, with an orange "!" while alerts are off */}
        <span className="lq-icon-btn relative text-slate-700">
          <Icon name="bell" className="w-[22px] h-[22px]" />
          {!state && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-flame-500 text-white text-xs font-bold flex items-center justify-center">!</span>
          )}
        </span>
        {state && <span className="text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-2.5 py-1">{state.mode === 'push' ? 'Push' : 'SMS'}</span>}
      </div>

      <p className="mt-4 text-lg text-slate-800">{t('alerts.statTitle')}</p>

      <div className="mt-auto pt-3">
        <p className={`text-5xl font-light tracking-tight ${state ? 'text-brand-700' : 'text-slate-900'}`}>
          {state ? t('alerts.statOn') : t('alerts.statOff')}
        </p>

        {smsWithoutPhone && (
          <p className="text-xs text-amber-700 mt-1">
            {/* <Trans> lets a link sit inside translated text, in the right place for each language */}
            <Trans i18nKey="alerts.addPhone" components={{ link: <Link to="/profile" className="underline" /> }} />
          </p>
        )}
        {message && <p className={`text-xs mt-1 ${isError ? 'text-red-600' : 'text-slate-500'}`}>{message}</p>}

        {state ? (
          <button onClick={turnOff} disabled={busy} className="mt-2 text-sm text-slate-500 underline">
            {t('alerts.turnOff')}
          </button>
        ) : (
          <button onClick={turnOn} disabled={busy}
            className="mt-3 w-full rounded-full bg-[#0b0b0f] text-white py-2.5 text-sm font-medium disabled:opacity-60 active:opacity-80">
            {busy ? t('alerts.turningOn') : t('alerts.turnOn')}
          </button>
        )}
      </div>
    </section>
  )
}
