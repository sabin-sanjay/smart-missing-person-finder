// PoliceAnalytics.jsx: numbers and charts for police and admin (/police/analytics).
//
// Everything is worked out on the phone from three small database reads:
//   - all cases       (status and dates)
//   - all sightings   (dates and AI face scores)
//   - the alert log   (which zone, 2 / 5 / 10 km, each alert went out in)
// The charts are plain coloured boxes (no chart library), so this page stays light.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const LIKELY_MATCH = 0.7 // same threshold the backend uses for "likely the same person"

// "How long" in friendly words: 45 min / 6 h / 3 days
function duration(ms) {
  if (ms == null || Number.isNaN(ms)) return '–'
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))} min`
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)} h`
  return `${Math.round(ms / DAY)} days`
}

const STATUS_COLOURS = {
  pending: '#f5b5b0',  // light pink
  active: '#d6343f',   // red
  found: '#5a0f17',    // deep wine
  rejected: '#9a9aa5', // grey
}

export default function PoliceAnalytics() {
  const [cases, setCases] = useState([])
  const [sightings, setSightings] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      // Three reads at the same time. Only the columns we need (less data).
      const [c, s, a] = await Promise.all([
        supabase.from('missing_persons')
          .select('id, status, created_at, verified_at, found_at, last_seen_lat, last_seen_lng').limit(2000),
        supabase.from('sightings').select('case_id, created_at, face_match_score').limit(5000),
        supabase.from('alert_log').select('radius_km, channel').limit(10000),
      ])
      const failed = c.error || s.error || a.error
      if (failed) setError('Could not load the numbers: ' + failed.message)
      setCases(c.data ?? [])
      setSightings(s.data ?? [])
      setAlerts(a.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // All the numbers, re-calculated only when the data changes
  const stats = useMemo(() => {
    const count = (status) => cases.filter((c) => c.status === status).length
    const found = cases.filter((c) => c.status === 'found' && c.found_at)
    const avgToFind = found.length
      ? found.reduce((sum, c) => sum + (new Date(c.found_at) - new Date(c.created_at)), 0) / found.length
      : null
    const reviewed = cases.filter((c) => c.verified_at)
    const avgToReview = reviewed.length
      ? reviewed.reduce((sum, c) => sum + (new Date(c.verified_at) - new Date(c.created_at)), 0) / reviewed.length
      : null

    // Cases reported on each of the last 7 days (oldest first)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const week = Array.from({ length: 7 }, (_, i) => {
      const start = new Date(today.getTime() - (6 - i) * DAY)
      const end = start.getTime() + DAY
      return {
        label: start.toLocaleDateString('en-IN', { weekday: 'short' }),
        value: cases.filter((c) => { const t = new Date(c.created_at).getTime(); return t >= start.getTime() && t < end }).length,
      }
    })

    return {
      total: cases.length,
      byStatus: { pending: count('pending'), active: count('active'), found: count('found'), rejected: count('rejected') },
      avgToFind,
      avgToReview,
      sightings: sightings.length,
      perCase: cases.length ? sightings.length / cases.length : 0,
      likely: sightings.filter((s) => s.face_match_score != null && s.face_match_score >= LIKELY_MATCH).length,
      alerts: alerts.length,
      byZone: [2, 5, 10].map((km) => ({ km, value: alerts.filter((a) => a.radius_km === km).length })),
      week,
    }
  }, [cases, sightings, alerts])

  const weekMax = Math.max(1, ...stats.week.map((d) => d.value))
  const zoneMax = Math.max(1, ...stats.byZone.map((z) => z.value))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="bk-liquid bk-title flex-1">📊 Analytics</h2>
      </div>
      <Link to="/police" className="text-sm text-muted underline px-1">← Back to police dashboard</Link>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-muted text-sm">Loading…</p>}

      {!loading && (
        <>
          {/* Key numbers: two joined olive panels */}
          <div className="bk-stack">
            <section className="bk-panel grid grid-cols-3 gap-3">
              <Stat label="Total cases" value={stats.total} />
              <Stat label="Active now" value={stats.byStatus.active} accent />
              <Stat label="Found" value={stats.byStatus.found} />
            </section>
            <div className="bk-notch" aria-hidden="true" />
            <section className="bk-panel grid grid-cols-2 gap-4">
              <Stat label="Avg. time to find" value={duration(stats.avgToFind)} />
              <Stat label="Avg. time to approve" value={duration(stats.avgToReview)} />
              <Stat label="Sightings" value={stats.sightings} sub={`${stats.perCase.toFixed(1)} per case`} />
              <Stat label="AI likely matches" value={stats.likely} accent />
            </section>
          </div>

          {/* Cases reported per day, last 7 days (bars like the reference design) */}
          <section className="bk-panel">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg text-sky-ink">New cases</p>
                <p className="bk-label">Last 7 days</p>
              </div>
              <span className="bk-chip">{stats.week.reduce((s, d) => s + d.value, 0)} total</span>
            </div>
            <div className="flex items-end gap-2 h-36 mt-5">
              {stats.week.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full">
                  {/* dark track with a filled part */}
                  <div className="w-full flex-1 rounded-xl bg-black/25 flex items-end overflow-hidden">
                    <div className={`w-full rounded-xl ${i === 6 ? 'bk-liquid-orange' : 'bg-sky-ink'}`}
                      style={{ height: `${Math.max(d.value ? 12 : 0, (d.value / weekMax) * 100)}%` }}
                      title={`${d.value} case(s)`} />
                  </div>
                  <span className="font-mono text-[10px] text-white/70">{d.label}</span>
                  <span className="font-mono text-[11px]">{d.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Status of all cases as one coloured bar */}
          <section className="bk-sheet">
            <p className="text-lg">Case status</p>
            <div className="flex h-4 rounded-full overflow-hidden mt-3 bg-ink/10">
              {Object.entries(stats.byStatus).map(([status, n]) => n > 0 && (
                <div key={status} style={{ width: `${(n / Math.max(1, stats.total)) * 100}%`, background: STATUS_COLOURS[status] }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {Object.entries(stats.byStatus).map(([status, n]) => (
                <p key={status} className="flex items-center gap-2 text-sm capitalize">
                  <span className="w-3 h-3 rounded-full" style={{ background: STATUS_COLOURS[status] }} />
                  {status} <span className="font-mono text-muted ml-auto">{n}</span>
                </p>
              ))}
            </div>
          </section>

          {/* Alerts sent in each zone */}
          <section className="bk-sheet">
            <div className="flex items-center justify-between">
              <p className="text-lg">Alerts sent</p>
              <span className="font-mono text-sm text-muted">{stats.alerts} total</span>
            </div>
            <div className="space-y-2.5 mt-3">
              {stats.byZone.map((z) => (
                <div key={z.km} className="flex items-center gap-3">
                  <span className="font-mono text-xs w-12">{z.km} km</span>
                  <div className="flex-1 h-3 rounded-full bg-ink/10 overflow-hidden">
                    <div className="h-full rounded-full bk-btn-ink" style={{ width: `${(z.value / zoneMax) * 100}%` }} />
                  </div>
                  <span className="font-mono text-xs w-8 text-right">{z.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Where people went missing */}
          <section className="bk-sheet">
            <p className="text-lg">Hotspots</p>
            <p className="text-sm text-muted">Where people were last seen. Bigger, darker areas = more cases.</p>
            <HotspotMap cases={cases} />
          </section>
        </>
      )}
    </div>
  )
}

// One number with a small label above it
function Stat({ label, value, sub, accent }) {
  return (
    <div className="min-w-0">
      <p className="bk-label">{label}</p>
      <p className={`bk-num text-3xl leading-tight mt-0.5 ${accent ? 'text-tangerine' : ''}`}>{value}</p>
      {sub && <p className="bk-label">{sub}</p>}
    </div>
  )
}

// A small map with a soft circle for every case, coloured by status.
// Overlapping circles build up into darker "hotspots".
function HotspotMap({ cases }) {
  const divRef = useRef(null)
  useEffect(() => {
    if (!divRef.current) return
    const map = L.map(divRef.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)
    const points = cases.map((c) => [c.last_seen_lat, c.last_seen_lng])
    cases.forEach((c) => {
      L.circle([c.last_seen_lat, c.last_seen_lng], {
        radius: 1500, stroke: false, fillOpacity: 0.28, fillColor: STATUS_COLOURS[c.status] || '#d6343f',
      }).addTo(map)
    })
    if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 12 })
    else map.setView([22.5, 79], 4) // India
    return () => map.remove()
  }, [cases])
  return <div ref={divRef} className="h-72 rounded-2xl overflow-hidden mt-3 z-0" />
}
