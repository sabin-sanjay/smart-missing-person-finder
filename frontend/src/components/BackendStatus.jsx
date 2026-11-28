// BackendStatus.jsx: a small warning when the AI server isn't running, so
// police and users know why face search / video search / alerts are paused
// instead of guessing. Shows nothing while it's fine.

import { useEffect, useState } from 'react'
import { checkBackend } from '../lib/backend'

export default function BackendStatus({ forPolice = false }) {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let alive = true
    const check = () => checkBackend().then((ok) => alive && setOnline(ok))
    check()
    const id = setInterval(check, 60000) // look again every minute
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (online) return null
  return (
    <div role="status" className="bk-row !rounded-2xl !p-3 text-sm border-red-600" style={{ borderColor: 'rgb(255 59 64 / 0.6)' }}>
      <span>
        🔴 <b>AI server offline.</b>{' '}
        {forPolice
          ? 'Face matching, video search, alerts and notifications are paused. Restart start-backend.cmd on the server laptop.'
          : 'Photo search is paused for a moment. Please try again later.'}
      </span>
    </div>
  )
}
