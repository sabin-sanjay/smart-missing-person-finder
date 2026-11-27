// haptics.js: a short vibration when an important button is tapped.
//
// Which buttons vibrate:
//   - every red main button (classes bk-btn-orange, bk-btn-ink, bk-liquid-orange):
//     "Report sighting", "Turn on alerts", "Send to police", "Log in", ...
//   - anything marked  data-haptic="strong"  gets a double buzz
//     (big police actions: Approve, Mark as found, Reject)
//
// Works on Android phones. iPhones don't let websites vibrate, so there it
// simply does nothing (no errors).

const LIGHT = 18          // one short buzz (milliseconds)
const STRONG = [30, 50, 30] // buzz, pause, buzz

const IMPORTANT = '.bk-btn-orange, .bk-btn-ink, .bk-liquid-orange, [data-haptic]'

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
