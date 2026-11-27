// MapPage.jsx — the LIVE map.
//
// Everyone sees:
//   - each ACTIVE missing person as a round photo pin at their last-seen spot
//   - a red circle showing how far the alerts currently reach (2 / 5 / 10 km)
//   - a blue dot for "you are here" (if location is allowed)
// Police/admin also see:
//   - sightings from the last 7 days (orange = new, green = confirmed)
//
// "Live" means: when a case is approved/found or a sighting comes in,
// the map updates by itself (Supabase Realtime).

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase, casePhotoUrl } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getCurrentPosition } from '../lib/geo'
import { timeAgo } from '../lib/dates'

const INDIA_CENTER = [20.59, 78.96]
const SIGHTING_COLORS = { new: '#f59e0b', confirmed: '#16a34a' }

// Builds small popup contents safely. We set text with textContent (never
// raw HTML), so a name like "<script>" can't run code. Text typed by the
// public is never trusted.
function makePopup(lines, linkText, onLinkClick) {
  const div = document.createElement('div')
  div.style.minWidth = '150px'
  lines.forEach(([text, bold]) => {
    const p = document.createElement('div')
    p.textContent = text
    if (bold) p.style.fontWeight = '600'
    div.appendChild(p)
  })
  if (linkText) {
    const a = document.createElement('a')
    a.href = '#'
    a.textContent = linkText
    a.style.display = 'block'
    a.style.marginTop = '6px'
    a.addEventListener('click', (e) => {
      e.preventDefault()
      onLinkClick()
    })
    div.appendChild(a)
  }
  return div
}

// A round photo pin (an <img> inside a red ring)
function photoIcon(url) {
  const img = document.createElement('img')
  img.src = url || '/favicon.svg'
  img.alt = ''
  img.style.cssText =
    'width:44px;height:44px;border-radius:50%;object-fit:cover;border:3px solid #dc2626;background:#e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,.4)'
  return L.divIcon({ html: img, className: '', iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -22] })
}

export default function MapPage() {
  const { role } = useAuth()
  const isStaff = role === 'police' || role === 'admin'
  const navigate = useNavigate()

  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const casesLayerRef = useRef(null)     // a group holding all case pins + circles
  const sightingsLayerRef = useRef(null) // a group holding all sighting dots
  const fittedRef = useRef(false)        // have we zoomed to the cases yet?

  const [cases, setCases] = useState([])
  const [sightings, setSightings] = useState([])
  const [showSightings, setShowSightings] = useState(true)
  const [error, setError] = useState('')

  // ---- 1) Create the map once ----
  useEffect(() => {
    const map = L.map(mapDivRef.current).setView(INDIA_CENTER, 5)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)
    casesLayerRef.current = L.layerGroup().addTo(map)
    sightingsLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // Blue "you are here" dot
    getCurrentPosition().then((pos) => {
      if (!pos || !mapRef.current) return
      L.circleMarker([pos.lat, pos.lng], {
        radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1,
      }).bindTooltip('You are here').addTo(mapRef.current)
      if (!fittedRef.current) mapRef.current.setView([pos.lat, pos.lng], 12)
    })

    return () => {
      map.remove()
      mapRef.current = null
      fittedRef.current = false
    }
  }, [])

  // ---- 2) Load data, and reload whenever something changes (live) ----
  useEffect(() => {
    async function loadCases() {
      const { data, error } = await supabase
        .from('missing_persons')
        .select('id, full_name, age, photo_path, last_seen_at, last_seen_address, last_seen_lat, last_seen_lng, alert_radius_km')
        .eq('status', 'active')
        .limit(500)
      if (error) setError('Could not load cases: ' + error.message)
      else setCases(data)
    }

    async function loadSightings() {
      if (!isStaff) return setSightings([])
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('sightings')
        .select('id, case_id, seen_at, lat, lng, notes, review_status, case:missing_persons(full_name, status)')
        .neq('review_status', 'dismissed')
        .gte('seen_at', weekAgo)
        .order('seen_at', { ascending: false })
        .limit(500)
      if (error) setError('Could not load sightings: ' + error.message)
      else setSightings(data.filter((s) => s.case?.status === 'active'))
    }

    loadCases()
    loadSightings()

    // Realtime: reload when cases or sightings change.
    // (The database's security rules decide which changes each person receives.)
    const channel = supabase
      .channel('live-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missing_persons' }, loadCases)
    if (isStaff) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'sightings' }, loadSightings)
    }
    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isStaff])

  // ---- 3) Draw the case pins whenever the list changes ----
  useEffect(() => {
    const layer = casesLayerRef.current
    if (!layer) return
    layer.clearLayers()

    cases.forEach((c) => {
      const point = [c.last_seen_lat, c.last_seen_lng]
      // Alert circle (radius in metres)
      L.circle(point, {
        radius: c.alert_radius_km * 1000,
        color: '#dc2626', weight: 1, fillOpacity: 0.08, interactive: false,
      }).addTo(layer)
      // Photo pin with a popup
      L.marker(point, { icon: photoIcon(casePhotoUrl(c.photo_path)) })
        .bindPopup(
          makePopup(
            [
              [`${c.full_name}${c.age != null ? ', ' + c.age : ''}`, true],
              [`Last seen ${timeAgo(c.last_seen_at)}`],
              [c.last_seen_address || ''],
              [`Alerts within ${c.alert_radius_km} km`],
            ],
            isStaff ? 'Open case (police) →' : 'View details →',
            () => navigate(isStaff ? `/police/case/${c.id}` : `/case/${c.id}`),
          ),
        )
        .addTo(layer)
    })

    // The first time cases load, zoom so they're all visible
    if (cases.length && !fittedRef.current && mapRef.current) {
      fittedRef.current = true
      const bounds = L.latLngBounds(cases.map((c) => [c.last_seen_lat, c.last_seen_lng]))
      mapRef.current.fitBounds(bounds.pad(0.3), { maxZoom: 14 })
    }
  }, [cases, isStaff, navigate])

  // ---- 4) Draw sighting dots (police/admin only) ----
  useEffect(() => {
    const layer = sightingsLayerRef.current
    if (!layer) return
    layer.clearLayers()
    if (!showSightings) return

    sightings.forEach((s) => {
      L.circleMarker([s.lat, s.lng], {
        radius: 7, color: '#fff', weight: 2,
        fillColor: SIGHTING_COLORS[s.review_status] ?? '#f59e0b', fillOpacity: 1,
      })
        .bindPopup(
          makePopup(
            [
              [`Sighting: ${s.case?.full_name ?? ''}`, true],
              [`${timeAgo(s.seen_at)} · ${s.review_status}`],
              [s.notes ? s.notes.slice(0, 120) : ''],
            ],
            'Open case →',
            () => navigate(`/police/case/${s.case_id}`),
          ),
        )
        .addTo(layer)
    })
  }, [sightings, showSightings, navigate])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="bk-liquid bk-title">Live map</h2>
        <span className="text-xs text-green-700 font-semibold">● Live</span>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* The map fills most of the screen. "isolate" keeps it under the top bar. */}
      <div ref={mapDivRef} className="w-full h-[calc(100dvh-14rem)] min-h-80 rounded-xl border border-slate-300 isolate" />

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>🔴 Missing person ({cases.length})</span>
        <span>⭕ Alert area</span>
        <span>🔵 You</span>
        {isStaff && (
          <>
            <span>🟠 New sighting</span>
            <span>🟢 Confirmed</span>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showSightings} onChange={(e) => setShowSightings(e.target.checked)} />
              Show sightings ({sightings.length})
            </label>
          </>
        )}
      </div>
    </div>
  )
}
