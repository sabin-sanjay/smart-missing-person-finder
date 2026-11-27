// CaseMessages.jsx: a private chat on one case between the family who
// reported it and the police. Only they can read it (database rules, 014).
// New messages appear live; the other side also gets a push notification.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/dates'

export default function CaseMessages({ caseId, myId }) {
  const { t } = useTranslation()
  const [list, setList] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('case_messages')
      .select('id, sender_id, from_police, body, created_at')
      .eq('case_id', caseId)
      .order('created_at')
      .limit(200)
    setList(data ?? [])
  }, [caseId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`messages-${caseId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'case_messages', filter: `case_id=eq.${caseId}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [caseId, load])

  // keep the newest message in view
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [list])

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setBusy(true)
    setError('')
    const { error } = await supabase.from('case_messages').insert({ case_id: caseId, body })
    setBusy(false)
    if (error) return setError(t('chat.failed'))
    setText('')
    load()
  }

  return (
    <section className="bk-sheet space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg">💬 {t('chat.title')}</h3>
        <span className="badge">🔒 {t('chat.private')}</span>
      </div>
      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
        {list.length === 0 && <p className="text-sm text-white/60">{t('chat.empty')}</p>}
        {list.map((m) => {
          const mine = m.sender_id === myId
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-[#e5161d] text-white' : 'bg-white/12 border border-white/15'}`}>
                <p className="text-[0.68rem] opacity-75 mb-0.5">
                  {m.from_police ? `👮 ${t('chat.police')}` : `👪 ${t('chat.family')}`} · {timeAgo(m.created_at)}
                </p>
                <p className="whitespace-pre-line break-words">{m.body}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input className="bk-input flex-1" maxLength={1000} placeholder={t('chat.placeholder')}
          value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={busy || !text.trim()} className="bk-btn bk-btn-orange !px-5">{t('chat.send')}</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
