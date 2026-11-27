// LocationPicker.jsx
// A small map. Tap anywhere to drop a pin on the "last seen" spot, or press
// "Use my location". It uses free OpenStreetMap map pictures (tiles).
//
//   <LocationPicker value={{ lat, lng }} onChange={(point) => ...} />
//   <LocationPicker value={{ lat, lng }} readOnly />   <- just shows the pin
//
// This file is loaded only when needed (see RegisterCase.jsx), so people
// who never open a map don't download the map code.

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'

const INDIA_CENTER = [20.59, 78.96] // starting view if no point is chosen yet

// A pin made of plain HTML (Leaflet's default pin images don't load in Vite apps)
const pinIcon = L.divIcon({
  html: '<div style="font-size:32px;line-height:32px">📍</div>',
  className: '',       // removes Leaflet's default white box
  iconSize: [32, 32],
  iconAnchor: [16, 32], // the pin's tip touches the chosen spot
})

export default function LocationPicker({ value, onChange, readOnly = false }) {
  const { t } = useTranslation()
  const mapDivRef = useRef(null)   // the <div> the map draws into
  const mapRef = useRef(null)      // the Leaflet map object
  const markerRef = useRef(null)   // the pin
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange   // always call the latest onChange

  const [locating, setLocating] = useState(false)
  const [gpsError, setGpsError] = useState('')

  // Create the map once, when this component first appears
  useEffect(() => {
    const map = L.map(mapDivRef.current, { zoomControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors', // required by OpenStreetMap's rules
    }).addTo(map)
    map.setView(INDIA_CENTER, 5)

    // Tapping the map moves the pin there (unless the map is view-only)
    if (!readOnly) {
      map.on('click', (e) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
    }

    mapRef.current = map
    // Clean up if the page closes
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Whenever the chosen point changes, move (or create) the pin
  useEffect(() => {
    const map = mapRef.current
    if (!map || !value) return
    const point = [value.lat, value.lng]
    if (markerRef.current) {
      markerRef.current.setLatLng(point)
    } else {
      markerRef.current = L.marker(point, { icon: pinIcon }).addTo(map)
      map.setView(point, Math.max(map.getZoom(), 15)) // zoom in on the first pin
    }
  }, [value])

  // Ask the phone for its GPS position
  function useMyLocation() {
    setGpsError('')
    if (!navigator.geolocation) {
      setGpsError(t('picker.noGeo'))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        onChangeRef.current(point)
        mapRef.current?.setView([point.lat, point.lng], 16)
      },
      (err) => {
        setLocating(false)
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? t('picker.denied')
            : t('picker.failed'),
        )
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  // The map itself. "isolate" keeps it below the top bar when scrolling.
  const mapBox = <div ref={mapDivRef} className="h-64 w-full rounded-lg border border-slate-300 isolate" />

  if (readOnly) return mapBox

  return (
    <div className="space-y-2">
      {mapBox}
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="w-full border border-slate-300 rounded-lg py-2 text-sm font-semibold disabled:opacity-60 active:bg-slate-100"
      >
        {locating ? t('picker.finding') : t('picker.useMyLocation')}
      </button>
      {gpsError && <p className="text-amber-700 text-sm">{gpsError}</p>}
      <p className="text-xs text-muted">
        {value
          ? t('picker.pinAt', { lat: value.lat.toFixed(5), lng: value.lng.toFixed(5) })
          : t('picker.tapHint')}
      </p>
    </div>
  )
}
