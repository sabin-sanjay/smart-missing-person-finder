// tooltips.js: small labels for icon buttons on computers (mouse hover).
// Add  data-tip="Text size"  to any element.
//
// TOOLTIP SKIP DELAY: the first label waits 500 ms (so it doesn't flash
// while you just move the mouse across). Once a label is showing, moving to
// the next button shows its label INSTANTLY, for up to 400 ms after the last
// one closed - like the toolbar tooltips in Google Docs or Figma.
// Phones/touch screens don't get tooltips (there is no hover).

const OPEN_DELAY = 500
const SKIP_WINDOW = 400

export function setupTooltips() {
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return

  const tip = document.createElement('div')
  tip.className = 'tooltip'
  tip.setAttribute('role', 'tooltip')
  document.body.appendChild(tip)

  let timer = null, current = null, lastClosed = 0

  const show = (el) => {
    tip.textContent = el.getAttribute('data-tip')
    const r = el.getBoundingClientRect()
    tip.style.transform = 'none'
    const w = tip.offsetWidth
    const x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))
    const above = r.top > 44
    const y = above ? r.top - tip.offsetHeight - 8 : r.bottom + 8
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)` // transform, not left/top
    tip.classList.toggle('below', !above)
    tip.classList.add('show')
  }
  const hide = () => {
    clearTimeout(timer)
    if (tip.classList.contains('show')) lastClosed = performance.now()
    tip.classList.remove('show')
    current = null
  }

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-tip]')
    if (!el || el === current) return
    clearTimeout(timer)
    current = el
    const skip = tip.classList.contains('show') || performance.now() - lastClosed < SKIP_WINDOW
    if (skip) { tip.classList.add('instant'); show(el) }
    else { tip.classList.remove('instant'); timer = setTimeout(() => current === el && show(el), OPEN_DELAY) }
  })
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('[data-tip]')
    if (el && !el.contains(e.relatedTarget)) hide()
  })
  document.addEventListener('pointerdown', hide)
  window.addEventListener('scroll', hide, { passive: true })
}
