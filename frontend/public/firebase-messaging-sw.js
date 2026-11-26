/*
  firebase-messaging-sw.js: runs in the BACKGROUND, even when the app is closed.
  When the backend sends an alert, this receives it and shows the notification.
  Tapping the notification opens the missing person's page.

  The Firebase settings arrive in this file's address (?apiKey=...&projectId=...),
  added by src/lib/push.js, so no settings are typed in here.
  (These Firebase web settings are public by design. The SECRET key lives
  only in the backend.)
*/

const params = new URL(self.location).searchParams
const version = params.get('v') || '13.4.0'

importScripts(
  `https://www.gstatic.com/firebasejs/${version}/firebase-app-compat.js`,
  `https://www.gstatic.com/firebasejs/${version}/firebase-messaging-compat.js`,
)

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
})

const messaging = firebase.messaging()

// An alert arrived while the app is closed or in the background
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {}
  self.registration.showNotification(d.title || 'Missing person alert', {
    body: d.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    image: d.image || undefined,   // the missing person's photo (shown on Android)
    tag: d.tag || undefined,       // replaces an older alert for the same case
    renotify: true,
    requireInteraction: true,      // stays on screen until the user taps it
    vibrate: [300, 100, 300],
    data: { url: d.url || '/' },
  })
})

// The user tapped the notification: open (or focus) the case page
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url === url && 'focus' in w) return w.focus()
      }
      return clients.openWindow(url)
    }),
  )
})
