// haptics.js: a short vibration when an important button is tapped.
//
// Which buttons vibrate:
//   - every app button (class bk-btn): "Report sighting", "Turn on alerts",
//     "Log in", "Share poster", "Details", "Turn off alerts", ...
//   - the bottom menu buttons
//   - anything marked  data-haptic  (data-haptic="strong" = double buzz for the
//     biggest actions: Send to police, Register case, Approve, Mark as found, Reject)
//
// Works on Android phones. iPhones don't let websites vibrate, so there it
// simply does nothing (no errors).

const LIGHT = 18          // one short buzz (milliseconds)
const STRONG = [30, 50, 30] // buzz, pause, buzz

const IMPORTANT = '.bk-btn, .bk-liquid-orange, .nav-circle, .nav-active, [data-haptic]'

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern)
  } catch {
    // some browsers throw if vibration is blocked: ignore
  }
}

/** Call once when the app starts. Listens for taps on the whole page. */
export function setupHaptics() {
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest?.(IMPORTANT)
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return
      vibrate(el.dataset.haptic === 'strong' ? STRONG : LIGHT)
    },
    { capture: true, passive: true },
  )
}
