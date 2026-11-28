// VoiceButton.jsx: "🎤 Speak" - talk instead of typing.
// Uses the phone's own speech recognition (free, built into Chrome on
// Android and computers). It listens in the app's language (English, Hindi,
// Tamil, Malayalam, Telugu) and adds what you said to the text box.
// On phones/browsers without speech recognition the button simply doesn't show.

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const SPEECH_LANG = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', ml: 'ml-IN', te: 'te-IN' }

export default function VoiceButton({ onText }) {
  const { t, i18n } = useTranslation()
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const rec = useRef(null)

  if (!Recognition) return null

  function start() {
    setError('')
    const r = new Recognition()
    r.lang = SPEECH_LANG[i18n.resolvedLanguage] || 'en-IN'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const text = Array.from(e.results).map((res) => res[0].transcript).join(' ').trim()
      if (text) onText(text)
    }
    r.onerror = (e) => setError(e.error === 'not-allowed' ? t('voice.denied') : t('voice.failed'))
    r.onend = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }

  function stop() {
    rec.current?.stop()
    setListening(false)
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={listening ? stop : start}
        className={`bk-btn !py-2 !px-4 !text-xs ${listening ? 'bk-btn-orange' : 'bk-btn-ghost'}`}
        aria-pressed={listening}>
        <span key={listening ? 'on' : 'off'} className="icon-swap">
          {listening ? `⏺ ${t('voice.listening')}` : `🎤 ${t('voice.speak')}`}
        </span>
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
