// MapPage.jsx: the LIVE map.
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
//
// Two map engines, same data:
//   - GOOGLE MAPS (dark style) when VITE_GOOGLE_MAPS_KEY is set in .env
//   - the free OpenStreetMap map (Leaflet) when there's no key, or if Google
//     fails to load (bad key, no internet), so the map always works.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase, casePhotoUrl } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getCurrentPosition } from '../lib/geo'
import { timeAgo } from '../lib/dates'
import { hasGoogleMaps, loadGoogleMaps, GOOGLE_MAP_ID } from '../lib/googleMaps'

const INDIA_CENTER = { lat: 20.59, lng: 78.96 }
const SIGHTING_COLORS = { new: '#f59e0b', confirmed: '#16a34a' }
const RED = '#e5161d'

// Builds small popup contents safely. We set text with textContent (never
// raw HTML), so a name like "<script>" can't run code. Text typed by the
// public is never trusted.
function makePopup(lines, linkText, onLinkClick, color) {
  const div = document.createElement('div')
  div.style.minWidth = '150px'
  if (color) div.style.color = color
  lines.forEach(([text, bold]) => {
    if (!text) return
    const p = document.createElement('div')
    p.textContent = text
    if (bold) p.style.fontWeight = '600'
    div.appendChild(p)
  })
  if (linkText) {
    const a = document.createElement('a')
    a.href = '#'
    a.textContent = linkText
    a.style.cssText = `display:block;margin-top:6px;color:${RED};font-weight:600`
    a.addEventListener('click', (e) => {
      e.preventDefault()
      onLinkClick()
    })
    div.appendChild(a)
  }
  return div
}

// A round photo (an <img> inside a red ring), used as the pin on both maps
function photoImg(url) {
  const img = document.createElement('img')
  img.src = url || '/favicon.svg'
  img.alt = ''
  img.style.cssText =
    `width:44px;height:44px;border-radius:50%;object-fit:cover;border:3px solid ${RED};background:#2a2729;box-shadow:0 2px 8px rgba(0,0,0,.6)`
  return img
}

// The words in each popup (same on both maps)
function caseLines(c) {
  return [
    [`${c.full_name}${c.age != null ? ', ' + c.age : ''}`, true],
    [`Last seen ${timeAgo(c.last_seen_at)}`],
    [c.last_seen_address || ''],
    [`Alerts within ${c.alert_radius_km} km`],
  ]
}
function sightingLines(s) {
  return [
    [`Sighting: ${s.case?.full_name ?? ''}`, true],
    [`${timeAgo(s.seen_at)} · ${s.review_status}`],
    [s.notes ? s.notes.slice(0, 120) : ''],
  ]
}

// =====================================================================
// GOOGLE MAPS version
// =====================================================================
function GoogleLiveMap({ cases, sightings, showSightings, isStaff, onFail }) {
  const navigate = useNavigate()
  const divRef = useRef(null)
  const mapRef = useRef(null)
  const gRef = useRef(null)          // the google.maps object, once loaded
  const infoRef = useRef(null)       // one shared popup window
  const caseShapes = useRef([])      // pins + circles currently drawn
  const sightingShapes = useRef([])
  const fittedRef = useRef(false)
  const [ready, setReady] = useState(false)

  // 1) Load Google and create the map once
  useEffect(() => {
    let cancelled = false
    // Google calls this if the key is wrong or not allowed on this website
    window.gm_authFailure = () => onFail('Google Maps key was refused, showing the free map instead.')

    loadGoogleMaps()
      .then(async (maps) => {
        if (cancelled) return
        const { Map } = await maps.importLibrary('maps')
        await maps.importLibrary('marker')
        const map = new Map(divRef.current, {
          center: INDIA_CENTER,
          zoom: 5,
          mapId: GOOGLE_MAP_ID,
          colorScheme: 'DARK',          // dark map to match the app
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          gestureHandling: 'greedy',    // one finger moves the map on phones
          clickableIcons: false,
        })
        gRef.current = maps
        mapRef.current = map
        infoRef.current = new maps.InfoWindow()
        setReady(true)

        // Blue "you are here" dot
        const pos = await getCurrentPosition()
        if (pos && !cancelled) {
          new maps.Circle({
            map, center: { lat: pos.lat, lng: pos.lng }, radius: 40,
            strokeColor: '#fff', strokeWeight: 3, fillColor: '#2563eb', fillOpacity: 1, clickable: false,
          })
          if (!fittedRef.current) { map.setCenter({ lat: pos.lat, lng: pos.lng }); map.setZoom(12) }
        }
      })
      .catch((e) => onFail(e.message))

    return () => {
      cancelled = true
      window.gm_authFailure = undefined
    }
  }, [onFail])

  // A popup that opens at a point
  function openPopup(content, position) {
    infoRef.current.setContent(content)
    infoRef.current.setPosition(position)
    infoRef.current.open({ map: mapRef.current })
  }

  // 2) Draw the case pins + alert circles whenever the list changes
  useEffect(() => {
    if (!ready) return
    const maps = gRef.current
    const map = mapRef.current
    caseShapes.current.forEach((s) => (s.setMap ? s.setMap(null) : (s.map = null)))
    caseShapes.current = []

    cases.forEach((c) => {
      const position = { lat: c.last_seen_lat, lng: c.last_seen_lng }
      const circle = new maps.Circle({
        map, center: position, radius: c.alert_radius_km * 1000,
        strokeColor: RED, strokeWeight: 1, fillColor: RED, fillOpacity: 0.1, clickable: false,
      })
      const pin = new maps.marker.AdvancedMarkerElement({
        map, position, content: photoImg(casePhotoUrl(c.photo_path)), title: c.full_name,
      })
      pin.addListener('click', () =>
        openPopup(
          makePopup(caseLines(c), isStaff ? 'Open case (police) →' : 'View details →',
            () => navigate(isStaff ? `/police/case/${c.id}` : `/case/${c.id}`), '#161214'),
          position,
        ),
      )
      caseShapes.current.push(circle, pin)
    })

    // The first time cases load, zoom so they're all visible
    if (cases.length && !fittedRef.current) {
      fittedRef.current = true
      const bounds = new maps.LatLngBounds()
      cases.forEach((c) => bounds.extend({ lat: c.last_seen_lat, lng: c.last_seen_lng }))
      map.fitBounds(bounds, 60)
      if (cases.length === 1) maps.event.addListenerOnce(map, 'idle', () => map.getZoom() > 14 && map.setZoom(14))
    }
  }, [ready, cases, isStaff, navigate])

  // 3) Draw sighting dots (police/admin only)
  useEffect(() => {
    if (!ready) return
    const maps = gRef.current
    sightingShapes.current.forEach((s) => s.setMap(null))
    sightingShapes.current = []
    if (!showSightings) return

    sightings.forEach((s) => {
      const position = { lat: s.lat, lng: s.lng }
      const dot = new maps.Marker({
        map: mapRef.current, position,
        icon: {
          path: maps.SymbolPath.CIRCLE, scale: 7, strokeColor: '#fff', strokeWeight: 2,
          fillColor: SIGHTING_COLORS[s.review_status] ?? '#f59e0b', fillOpacity: 1,
        },
      })
      dot.addListener('click', () =>
        openPopup(makePopup(sightingLines(s), 'Open case →', () => navigate(`/police/case/${s.case_id}`), '#161214'), position),
      )
      sightingShapes.current.push(dot)
    })
  }, [ready, sightings, showSightings, navigate])

  return <div ref={divRef} className="w-full h-[calc(100dvh-14rem)] min-h-80 rounded-[1.75rem] overflow-hidden isolate bg-[#1c1a1b]" />
}

// =====================================================================
// Free OpenStreetMap version (Leaflet)
// =====================================================================
function FreeLiveMap({ cases, sightings, showSightings, isStaff }) {
  const navigate = useNavigate()
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const casesLayerRef = useRef(null)
  const sightingsLayerRef = useRef(null)
  const fittedRef = useRef(false)

  // 1) Create the map once
  useEffect(() => {
    const map = L.map(mapDivRef.current).setView([INDIA_CENTER.lat, INDIA_CENTER.lng], 5)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)
    casesLayerRef.current = L.layerGroup().addTo(map)
    sightingsLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

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

  // 2) Case pins + alert circles
  useEffect(() => {
    const layer = casesLayerRef.current
    if (!layer) return
    layer.clearLayers()
    cases.forEach((c) => {
      const point = [c.last_seen_lat, c.last_seen_lng]
      L.circle(point, { radius: c.alert_radius_km * 1000, color: RED, weight: 1, fillOpacity: 0.08, interactive: false }).addTo(layer)
      L.marker(point, {
        icon: L.divIcon({ html: photoImg(casePhotoUrl(c.photo_path)), className: '', iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -22] }),
      })
        .bindPopup(makePopup(caseLines(c), isStaff ? 'Open case (police) →' : 'View details →',
          () => navigate(isStaff ? `/police/case/${c.id}` : `/case/${c.id}`)))
        .addTo(layer)
    })
    if (cases.length && !fittedRef.current && mapRef.current) {
      fittedRef.current = true
      const bounds = L.latLngBounds(cases.map((c) => [c.last_seen_lat, c.last_seen_lng]))
      mapRef.current.fitBounds(bounds.pad(0.3), { maxZoom: 14 })
    }
  }, [cases, isStaff, navigate])

  // 3) Sighting dots
  useEffect(() => {
    const layer = sightingsLayerRef.current
    if (!layer) return
    layer.clearLayers()
    if (!showSightings) return
    sightings.forEach((s) => {
      L.circleMarker([s.lat, s.lng], {
        radius: 7, color: '#fff', weight: 2, fillColor: SIGHTING_COLORS[s.review_status] ?? '#f59e0b', fillOpacity: 1,
      })
        .bindPopup(makePopup(sightingLines(s), 'Open case →', () => navigate(`/police/case/${s.case_id}`)))
        .addTo(layer)
    })
  }, [sightings, showSightings, navigate])

  return <div ref={mapDivRef} className="w-full h-[calc(100dvh-14rem)] min-h-80 rounded-[1.75rem] isolate" />
}

// =====================================================================
// The page: loads the live data and picks the map engine
// =====================================================================
export default function MapPage() {
  const { role } = useAuth()
  const isStaff = role === 'police' || role === 'admin'

  const [cases, setCases] = useState([])
  const [sightings, setSightings] = useState([])
  const [showSightings, setShowSightings] = useState(true)
  const [error, setError] = useState('')
  const [useGoogle, setUseGoogle] = useState(hasGoogleMaps)
  const [notice, setNotice] = useState('')

  // If Google fails, switch to the free map (useRef keeps the function the same between renders)
  const failRef = useRef((msg) => {
    setNotice(msg)
    setUseGoogle(false)
  })

  // Load data, and reload whenever something changes (live)
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

  const mapProps = { cases, sightings, showSightings, isStaff }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="bk-liquid bk-title">Live map</h2>
        <span className="text-xs text-green-800 font-semibold">● Live</span>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {notice && <p className="text-xs text-muted">{notice}</p>}

      {useGoogle
        ? <GoogleLiveMap {...mapProps} onFail={failRef.current} />
        : <FreeLiveMap {...mapProps} />}

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
