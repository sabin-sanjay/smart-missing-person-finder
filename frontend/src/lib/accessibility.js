// accessibility.js: bigger text and a high-contrast look, for older users or
// anyone who finds the screen hard to read. The choice is remembered on this
// phone. It works by putting a class on the page's <html> element; the CSS in
// index.css does the rest (all sizes in the app grow with the page text size).
//
//   normal    the usual look
//   large     text 12% bigger
//   xl        text 25% bigger
//   contrast  plain black and white with strong borders, plus large text

const KEY = 'lumen-a11y'
export const A11Y_MODES = ['normal', 'large', 'xl', 'contrast']

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
  html.classList.toggle('text-large', mode === 'large' || mode === 'contrast')
  html.classList.toggle('text-xl', mode === 'xl')
  html.classList.toggle('high-contrast', mode === 'contrast')
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // storage blocked: still works until the app is closed
  }
}
