// push.js: turning alerts on/off on this phone.
//
// How it works:
//  1. Ask permission to show notifications
//  2. Get this phone's Firebase "token" (its address for push messages)
//  3. Get the phone's location
//  4. Save token + location in Supabase (save_alert_subscription)
//  The backend then sends alerts to phones near a missing person.
//
// The Firebase library is loaded only when needed, to keep the app light.

import { supabase } from './supabase'
import { getCurrentPosition } from './geo'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY

// Remembered on this phone only (localStorage), so we know alerts are on
const STORAGE_KEY = 'alerts'

export function getSavedAlertState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) // { mode: 'push'|'sms', token, lastSaved }
  } catch {
    return null
  }
}
function saveAlertState(state) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked: alerts still work, we just won't remember the setting
  }
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId && vapidKey,
)

// Loads Firebase and registers the background notification worker.
let messagingPromise = null
async function getMessagingSetup() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp, SDK_VERSION } = await import('firebase/app')
      const { getMessaging, isSupported } = await import('firebase/messaging')
      if (!(await isSupported())) return null

      const app = initializeApp(firebaseConfig)
      const params = new URLSearchParams({ ...firebaseConfig, v: SDK_VERSION })
      // A separate "scope" so it doesn't clash with the app's offline worker
      const registration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${params}`,
        { scope: '/firebase-cloud-messaging-push-scope' },
      )
      return { messaging: getMessaging(app), registration }
    })()
  }
  return messagingPromise
}

async function getPushToken() {
  const setup = await getMessagingSetup()
  if (!setup) return null
  const { getToken } = await import('firebase/messaging')
  return getToken(setup.messaging, { vapidKey, serviceWorkerRegistration: setup.registration })
}

/**
 * Turn alerts on. Returns { ok, mode, code, detail }.
 * "code" is a short name for the message (e.g. "noLocation"); the screen
 * turns it into words in the user's language (alerts.msg.* in the locale files).
 * isLoggedIn: needed for the SMS fallback (SMS goes to the phone number in the profile).
 */
export async function enableAlerts({ isLoggedIn }) {
  // Location first: without it we can't know who is "nearby"
  const position = await getCurrentPosition()
  if (!position) return { ok: false, code: 'noLocation' }

  let token = null
  if (isFirebaseConfigured && 'Notification' in window && 'serviceWorker' in navigator) {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      try {
        token = await getPushToken()
      } catch (err) {
        console.error('Could not get push token:', err)
      }
    }
  }

  if (!token && !isLoggedIn) return { ok: false, code: 'blocked' }

  const { error } = await supabase.rpc('save_alert_subscription', {
    p_token: token,
    p_lat: position.lat,
    p_lng: position.lng,
  })
  if (error) return { ok: false, code: 'saveFailed', detail: error.message }

  const mode = token ? 'push' : 'sms'
  saveAlertState({ mode, token, lastSaved: Date.now() })
  return { ok: true, mode, code: token ? 'onPush' : 'onSms' }
}

export async function disableAlerts() {
  const state = getSavedAlertState()
  await supabase.rpc('remove_alert_subscription', { p_token: state?.token ?? null })
  saveAlertState(null)
}

/**
 * Called when the app opens: if alerts are on, update the saved location
 * (at most every 30 minutes, to save battery and data).
 */
export async function refreshAlertLocation() {
  const state = getSavedAlertState()
  if (!state || Date.now() - (state.lastSaved || 0) < 30 * 60 * 1000) return
  const position = await getCurrentPosition()
  if (!position) return

  let token = state.token
  if (state.mode === 'push') {
    try {
      token = (await getPushToken()) || state.token // the token can change over time
    } catch {
      // keep the old one
    }
  }
  const { error } = await supabase.rpc('save_alert_subscription', {
    p_token: token, p_lat: position.lat, p_lng: position.lng,
  })
  if (!error) saveAlertState({ ...state, token, lastSaved: Date.now() })
}

/**
 * While the app is OPEN, Firebase doesn't show notifications by itself,
 * so we show them here too.
 */
export async function listenForForegroundAlerts() {
  const state = getSavedAlertState()
  if (state?.mode !== 'push' || !isFirebaseConfigured) return
  const setup = await getMessagingSetup()
  if (!setup) return
  const { onMessage } = await import('firebase/messaging')
  onMessage(setup.messaging, (payload) => {
    const d = payload.data || {}
    setup.registration.showNotification(d.title || 'Missing person alert', {
      body: d.body || '',
      icon: '/pwa-192x192.png',
      image: d.image || undefined,
      tag: d.tag || undefined,
      data: { url: d.url || '/' },
    })
  })
}
