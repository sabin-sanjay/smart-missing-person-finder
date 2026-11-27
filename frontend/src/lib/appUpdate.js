// appUpdate.js: keeps the installed app up to date by itself.
//
// An installed app (Home Screen on iPhone/Android) keeps a saved copy so it
// opens fast and works offline. Without this file, a phone only notices a new
// version after the app is fully closed and reopened.
//
// What this does:
//   - checks for a new version when the app opens,
//   - again every time you come back to it (switching apps), and every 30 min,
//   - when a new version is downloaded, the page reloads once to show it.

import { registerSW } from 'virtual:pwa-register'

export function setupAppUpdates() {
  if (!('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      // when the app comes back to the screen
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      // and every 30 minutes while it's open
      setInterval(check, 30 * 60 * 1000)
    },
  })
}
