// PoliceCaseDetail.jsx — one case, in full, for police/admin.
// Actions depend on the status:
//   pending -> Approve (starts alerts) or Reject (with a reason)
//   active  -> Mark as found (stops alerts)
// The database itself double-checks every action (Step 2 triggers),
// e.g. it refuses to change a "found" case back to "active".

import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { supabase, casePhotoUrl } from '../lib/supabase'
import StatusBadge from '../components/StatusBadge'
import CaseSightings from '../components/CaseSightings'
import CaseTimeline from '../components/CaseTimeline'
import CasePhotos from '../components/CasePhotos'
import CaseMessages from '../components/CaseMessages'
import ActivityLog from '../components/ActivityLog'
import { useAuth } from '../context/AuthContext'
import SharePosterButton from '../components/SharePosterButton'
import { downloadCasePdf } from '../lib/casePdf'

const LocationPicker = lazy(() => import('../components/LocationPicker.jsx'))

export default function PoliceCaseDetail() {
  const { user: me } = useAuth() // for the private chat with the family
  const { id } = useParams() // the case id from the address: /police/case/<id>
  const [c, setCase] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)

  async function handlePdf() {
    setPdfBusy(true)
    try {
      await downloadCasePdf(c)
    } catch (err) {
      setError('Could not make the PDF: ' + err.message)
    }
    setPdfBusy(false)
  }

  async function loadCase() {
    // "reporter:profiles!reported_by(...)" also fetches the name and phone of
    // the family member who reported it, from the profiles table.
    const { data, error } = await supabase
      .from('missing_persons')
      .select('*, reporter:profiles!reported_by(full_name, phone)')
      .eq('id', id)
      .maybeSingle()
    if (error) setError('Could not load case: ' + error.message)
    else if (!data) setError('Case not found.')
    else setCase(data)
    setLoading(false)
  }

  useEffect(() => {
    loadCase()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Saves a status change. The database fills in who/when automatically.
  async function changeStatus(changes, confirmText) {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    setError('')
    const { error } = await supabase.from('missing_persons').update(changes).eq('id', id)
    if (error) setError('Could not update: ' + error.message)
    else {
      setShowReject(false)
      await loadCase()
    }
    setBusy(false)
  }

  function reject() {
    if (reason.trim().length < 5) {
      setError('Please write a short reason for the family (at least 5 characters).')
      return
    }
    changeStatus(
      { status: 'rejected', rejection_reason: reason.trim() },
      `Reject the case for ${c.full_name}? The family will see your reason.`,
    )
  }

  if (loading) return <p className="text-muted text-sm">Loading…</p>
  if (!c) return <p className="text-red-600 text-sm">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <Link to="/police" className="text-brand-700 text-sm underline">← Back to dashboard</Link>
        <button onClick={handlePdf} disabled={pdfBusy}
          className="border border-slate-300 bg-transparent rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60">
          {pdfBusy ? 'Making PDF…' : '📄 Download PDF'}
        </button>
      </div>

      {/* Photo and main details */}
      <section className="bk-sheet space-y-3">
        <img src={casePhotoUrl(c.photo_path)} alt={c.full_name}
          className="w-full max-h-80 object-contain rounded-lg bg-slate-100" />
        <div>
          <h2 className="bk-liquid bk-title">
            {c.full_name}{c.age != null && <span className="font-normal text-muted">, {c.age}</span>}
          </h2>
          <StatusBadge status={c.status} />
        </div>
        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted">Gender</dt><dd>{c.gender ?? 'Not given'}</dd>
          <dt className="text-muted">Height</dt><dd>{c.height_cm ? `${c.height_cm} cm` : 'Not given'}</dd>
          <dt className="text-muted">Last seen</dt><dd>{new Date(c.last_seen_at).toLocaleString()}</dd>
          <dt className="text-muted">Place</dt><dd>{c.last_seen_address || 'See map'}</dd>
          <dt className="text-muted">Reported</dt><dd>{new Date(c.created_at).toLocaleString()}</dd>
          {c.verified_at && (<><dt className="text-muted">Reviewed</dt><dd>{new Date(c.verified_at).toLocaleString()}</dd></>)}
          {c.found_at && (<><dt className="text-muted">Found</dt><dd>{new Date(c.found_at).toLocaleString()}</dd></>)}
          {c.status === 'active' && (<><dt className="text-muted">Alert radius</dt><dd>{c.alert_radius_km} km</dd></>)}
        </dl>
        {c.description && <p className="text-sm whitespace-pre-line">{c.description}</p>}
        {c.rejection_reason && <p className="text-sm text-muted">Rejection reason: {c.rejection_reason}</p>}
      </section>

      {/* Who reported it, so police can call them to verify */}
      <section className="bk-sheet text-sm">
        <h3 className="font-semibold mb-1">Reported by</h3>
        <p>{c.reporter?.full_name || 'Name not given'}</p>
        {c.reporter?.phone ? (
          <a href={`tel:${c.reporter.phone}`} className="text-brand-700 underline">📞 {c.reporter.phone}</a>
        ) : (
          <p className="text-muted">No phone number in their profile</p>
        )}
      </section>

      {/* Last-seen location */}
      <section className="bk-sheet">
        <h3 className="font-semibold mb-2 text-sm">Last-seen location</h3>
        <Suspense fallback={<div className="h-64 rounded-lg bg-slate-100" />}>
          <LocationPicker value={{ lat: c.last_seen_lat, lng: c.last_seen_lng }} readOnly />
        </Suspense>
      </section>

      {/* Sightings reported by the public (only for cases that went live) */}
      {(c.status === 'active' || c.status === 'found') && (
        <CaseSightings caseId={c.id} lastSeen={{ lat: c.last_seen_lat, lng: c.last_seen_lng }} />
      )}
      <CasePhotos caseId={c.id} canEdit userId={me?.id} />
      {me && <CaseMessages caseId={c.id} myId={me.id} />}
      <CaseTimeline caseId={c.id} />
      {c.status === 'active' && (
        <SharePosterButton c={c} />
      )}
      {c.status === 'active' && (
        <Link to={`/police/video?case=${c.id}`} className="w-full bk-btn bk-btn-ghost">🎥 Search CCTV video for this person</Link>
      )}
      <ActivityLog caseId={c.id} />

      {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}

      {/* ---- Actions ---- */}
      {c.status === 'pending' && !showReject && (
        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy}
            onClick={() => changeStatus({ status: 'active' }, `Approve the case for ${c.full_name}? Alerts will start going out within 2 km.`)}
            data-haptic="strong" className="bg-green-700 text-white rounded-xl py-3 font-semibold disabled:opacity-60">
            ✓ Approve
          </button>
          <button disabled={busy} onClick={() => setShowReject(true)}
            data-haptic="light" className="bg-transparent border border-red-600 text-red-600 rounded-xl py-3 font-semibold disabled:opacity-60">
            ✖ Reject
          </button>
        </div>
      )}

      {c.status === 'pending' && showReject && (
        <section className="bk-sheet space-y-2">
          <label className="block text-sm font-semibold">Reason for rejecting (the family will see this)</label>
          <textarea rows="3" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base"
            placeholder="e.g. Could not verify the report. Please visit your nearest police station." />
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setShowReject(false)} className="border border-slate-300 rounded-xl py-3 font-semibold">
              Cancel
            </button>
            <button disabled={busy} onClick={reject}
              data-haptic="strong" className="bg-red-600 text-white rounded-xl py-3 font-semibold disabled:opacity-60">
              Confirm reject
            </button>
          </div>
        </section>
      )}

      {c.status === 'active' && (
        <button disabled={busy}
          onClick={() => changeStatus({ status: 'found' }, `Mark ${c.full_name} as FOUND? This stops all alerts.`)}
          data-haptic="strong" className="w-full bg-green-700 text-white rounded-xl py-3 font-semibold disabled:opacity-60">
          ✅ Mark as found
        </button>
      )}
    </div>
  )
}
