// googleMaps.js: loads the Google Maps script only when a map is shown.
//
// The key comes from frontend/.env:  VITE_GOOGLE_MAPS_KEY=...
// A Google Maps *browser* key is public by design (it ends up in the page,
// like the Firebase web key). What keeps it safe is the restriction you set
// in Google Cloud: "Websites" -> only lumen.sabin-sanjay.workers.dev and localhost.
//
// No key?  hasGoogleMaps is false and the app uses the free OpenStreetMap map.

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''
// A "Map ID" is needed for the modern photo pins. DEMO_MAP_ID is Google's free test id.
export const GOOGLE_MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID'
export const hasGoogleMaps = Boolean(GOOGLE_MAPS_KEY)

let loading = null

/** Loads Google Maps once and gives back the "google.maps" object. */
export function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps)
  if (loading) return loading

  loading = new Promise((resolve, reject) => {
    const callbackName = '__lumenMapsReady'
    window[callbackName] = () => resolve(window.google.maps)
    const params = new URLSearchParams({
      key: GOOGLE_MAPS_KEY,
      v: 'weekly',
      loading: 'async',
      libraries: 'marker',
      callback: callbackName,
    })
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.onerror = () => {
      loading = null
      reject(new Error('Google Maps could not load (check the internet or the key).'))
    }
    document.head.appendChild(script)
  })
  return loading
}
