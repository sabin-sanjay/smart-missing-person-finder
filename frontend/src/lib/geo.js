// geo.js — small helpers for locations.

// Straight-line distance in km between two points on Earth
// (the "haversine" formula). Good enough for "2.3 km from you".
export function distanceKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371 // Earth's radius in km
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// "850 m" or "3.2 km"
export function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

// A link that opens the spot in Google Maps (handy for police on the move)
export function googleMapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

// Asks the phone for its location once. Resolves to { lat, lng } or null
// (null if the user says no, there's no GPS, or it takes too long).
export function getCurrentPosition(timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    )
  })
}
