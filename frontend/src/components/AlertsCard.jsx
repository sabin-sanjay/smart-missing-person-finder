// AlertsCard.jsx: the "🔔 Alerts near you" card on the Home page.

import { useState } from 'react'
import { Link } from 'react-router'
import { Trans, useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { enableAlerts, disableAlerts, getSavedAlertState } from '../lib/push'

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
    <section className="bg-white rounded-xl p-4 shadow-sm space-y-2">
      <h3 className="font-semibold">{t('alerts.title')}</h3>

      {state ? (
        <>
          <p className="text-sm text-green-700">{state.mode === 'push' ? t('alerts.onPush') : t('alerts.onSms')}</p>
          {smsWithoutPhone && (
            <p className="text-sm text-amber-700">
              {/* <Trans> lets a link sit inside translated text, in the right place for each language */}
              <Trans i18nKey="alerts.addPhone" components={{ link: <Link to="/profile" className="underline" /> }} />
            </p>
          )}
          <button onClick={turnOff} disabled={busy} className="text-sm text-slate-500 underline">
            {t('alerts.turnOff')}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">{t('alerts.intro')}</p>
          <button onClick={turnOn} disabled={busy}
            className="w-full bg-blue-900 text-white rounded-lg py-3 font-semibold disabled:opacity-60 active:bg-blue-950">
            {busy ? t('alerts.turningOn') : t('alerts.turnOn')}
          </button>
        </>
      )}

      {message && <p className={`text-sm ${isError ? 'text-red-600' : 'text-slate-600'}`}>{message}</p>}
    </section>
  )
}
