// ActivityLog.jsx: police/admin only. The automatic record of everything
// that happened on a case: who reported, approved, rejected or closed it,
// sightings reviewed, photos and messages (see supabase/016).

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const LABELS = {
  reported: '📝 Case reported',
  approved: '✅ Approved (alerts started)',
  rejected: '✖ Rejected',
  found: '🎉 Marked as found',
  pending: '⏳ Set back to pending',
  alert_zone: '📡 Alert area grew',
  sighting_reported: '👀 Sighting reported',
  sighting_confirmed: '✔ Sighting confirmed',
  sighting_dismissed: '🗑 Sighting dismissed',
  sighting_new: '↩ Sighting set back to new',
  photo_added: '🖼 Extra photo added',
  photo_removed: '🖼 Extra photo removed',
  message_police: '💬 Police sent a message',
  message_family: '💬 Family sent a message',
}

export default function ActivityLog({ caseId }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase
      .from('case_activity')
      .select('id, action, detail, created_at, actor:profiles(full_name, role)')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setRows(data ?? []))
  }, [caseId])

  if (!rows) return null

  return (
    <section className="bk-sheet space-y-2">
      <h3 className="text-lg">🗂 Activity log</h3>
      {rows.length === 0 && <p className="text-sm text-white/60">No activity recorded yet (the log starts from now).</p>}
      <ol className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="text-sm border-l-2 border-white/20 pl-3">
            <p>{LABELS[r.action] ?? r.action}{r.detail ? <span className="text-white/60"> · {r.detail}</span> : null}</p>
            <p className="text-xs text-white/55">
              {r.actor ? `${r.actor.full_name || 'Unnamed'} (${r.actor.role})` : 'System'} ·{' '}
              {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
