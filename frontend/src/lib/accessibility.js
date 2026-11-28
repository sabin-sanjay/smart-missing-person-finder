// accessibility.js: bigger text and a high-contrast look, for older users or
// anyone who finds the screen hard to read. The choice is remembered on this
// phone. It works by putting a class on the page's <html> element; the CSS in
// index.css does the rest (all sizes in the app grow with the page text size).
//
//   normal    the usual look
//   large     text 12% bigger
//   xl        text 25% bigger
//   contrast  plain black and white with strong borders, plus large text
//   light     a light theme (white glass on a soft blush page)
//
// INSTANT THEME SWITCH: while a theme changes, all transitions are paused for
// one frame, so the new look appears at once instead of slowly fading colour
// by colour.

const KEY = 'lumen-a11y'
export const A11Y_MODES = ['normal', 'large', 'xl', 'contrast', 'light']

export function getA11yMode() {
  try {
    const m = localStorage.getItem(KEY)
    return A11Y_MODES.includes(m) ? m : 'normal'
  } catch {
    return 'normal'
  }
}

export function applyA11yMode(mode = getA11yMode()) {
  const html = document.documentElement
  html.classList.add('theme-switching') // pause transitions so the switch is instant
  html.classList.toggle('theme-light', mode === 'light')
  html.classList.toggle('text-large', mode === 'large' || mode === 'contrast')
  html.classList.toggle('text-xl', mode === 'xl')
  html.classList.toggle('high-contrast', mode === 'contrast')
  // turn transitions back on after the new look has been drawn
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('theme-switching')))
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // storage blocked: still works until the app is closed
  }
}
