// SearchParty.jsx: "Join the search" for an active case.
// Volunteers tap "I searched here" (their current location). The map shows
// every area searched in the last 3 days as a green circle, so nobody
// searches the same street twice. Nobody's name is shown, only where/when.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getCurrentPosition } from '../lib/geo'

const AREA_METRES = 150 // the circle drawn for one "I searched here"

export default function SearchParty({ caseId, lastSeen }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const mapDiv = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [checks, setChecks] = useState([])
  const [volunteers, setVolunteers] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
    const [{ data }, { data: count }] = await Promise.all([
      supabase.from('search_checks').select('id, lat, lng, created_at').eq('case_id', caseId).gte('created_at', since).limit(500),
      supabase.rpc('search_volunteers', { p_case: caseId }),
    ])
    setChecks(data ?? [])
    setVolunteers(count ?? 0)
  }, [caseId])

  // the map, created once
  useEffect(() => {
    const map = L.map(mapDiv.current, { zoomControl: true }).setView([lastSeen.lat, lastSeen.lng], 14)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
    L.circleMarker([lastSeen.lat, lastSeen.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#e5161d', fillOpacity: 1 })
      .bindTooltip(t('party.lastSeen')).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    load()
    return () => map.remove()
  }, [lastSeen.lat, lastSeen.lng, load, t])

  // draw the searched areas
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    checks.forEach((c) => {
      L.circle([c.lat, c.lng], { radius: AREA_METRES, color: '#22c55e', weight: 1, fillColor: '#22c55e', fillOpacity: 0.25, interactive: false }).addTo(layer)
    })
  }, [checks])

  async function markSearched() {
    setMessage('')
    setBusy(true)
    const pos = await getCurrentPosition()
    if (!pos) {
      setBusy(false)
      return setMessage(t('party.noLocation'))
    }
    const { error } = await supabase.from('search_checks').insert({ case_id: caseId, lat: pos.lat, lng: pos.lng })
    setBusy(false)
    if (error) return setMessage(/2 minutes/.test(error.message) ? t('party.wait') : t('party.failed'))
    setMessage(t('party.thanks'))
    mapRef.current?.setView([pos.lat, pos.lng], 15)
    load()
  }

  return (
    <section className="bk-sheet space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg">{t('party.title')}</h3>
        <span className="badge badge-white">{t('party.volunteers', { count: volunteers })}</span>
      </div>
      <p className="text-sm text-white/70">{t('party.intro')}</p>
      <div ref={mapDiv} className="w-full h-64 rounded-2xl overflow-hidden isolate" />
      <p className="text-xs text-white/60">🟢 {t('party.legend', { count: checks.length })}</p>
      {session ? (
        <button type="button" onClick={markSearched} disabled={busy} data-haptic="strong" className="w-full bk-btn bk-btn-orange">
          {busy ? t('party.marking') : t('party.mark')}
        </button>
      ) : (
        <Link to="/login" className="w-full bk-btn bk-btn-ghost">{t('party.login')}</Link>
      )}
      {message && <p className="text-sm text-white/80">{message}</p>}
    </section>
  )
}
