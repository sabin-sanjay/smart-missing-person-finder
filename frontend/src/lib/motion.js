// motion.js: small physics helpers for touch movement.
//
// VELOCITY SPRINGS: when you let go of something you were dragging, it
// springs back using a real spring (stiffness + damping) that starts with
// the speed your finger was moving. A fast flick overshoots a bit more; a
// slow release settles gently. Everything moves with CSS `transform`
// (never `left`/`top`), which the phone's graphics chip handles smoothly.
//
// RUBBER BANDING: pulling past the end of a list stretches it with
// resistance (the further you pull, the less it moves), like a rubber band.

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Animate `el` from offset `from` (px) back to 0 with a spring, starting at `velocity` (px per second). */
export function springBack(el, axis, from, velocity) {
  const prop = axis === 'x' ? 'translateX' : 'translateY'
  if (reduceMotion()) { el.style.transform = ''; return }
  const stiffness = 320, damping = 26, mass = 1
  let x = from, v = velocity, last = performance.now()
  cancelAnimationFrame(el.__springFrame)
  const step = (now) => {
    const dt = Math.min(0.032, (now - last) / 1000); last = now
    const force = -stiffness * x - damping * v       // spring pulls back, damping slows it
    v += (force / mass) * dt
    x += v * dt
    if (Math.abs(x) < 0.3 && Math.abs(v) < 8) { el.style.transform = ''; return }
    el.style.transform = `${prop}(${x.toFixed(2)}px)`
    el.__springFrame = requestAnimationFrame(step)
  }
  el.__springFrame = requestAnimationFrame(step)
}

/** Resistance curve: big pulls give small, ever-slower movement (max ~`limit` px). */
export const rubber = (d, limit = 56) => Math.sign(d) * limit * (1 - Math.exp(-Math.abs(d) / (limit * 2.5)))

/**
 * Make `el` stretch when pulled past an edge and spring back on release.
 *   axis:   'x' (carousel) or 'y' (page)
 *   canPull(delta): true when pulling this way is "past the edge"
 * Returns a function that removes the behaviour.
 */
export function attachRubberBand(el, { axis = 'x', canPull }) {
  let start = null, offset = 0, samples = []
  const pos = (e) => (axis === 'x' ? e.touches[0].clientX : e.touches[0].clientY)

  const onStart = (e) => {
    cancelAnimationFrame(el.__springFrame)
    start = pos(e); offset = 0; samples = [[performance.now(), 0]]
  }
  const onMove = (e) => {
    if (start == null) return
    const d = pos(e) - start
    if (!canPull(d)) { if (offset) { offset = 0; el.style.transform = '' } return }
    offset = rubber(d)
    el.style.transform = axis === 'x' ? `translateX(${offset}px)` : `translateY(${offset}px)`
    samples.push([performance.now(), offset]); if (samples.length > 5) samples.shift()
  }
  const onEnd = () => {
    if (start == null) return
    start = null
    if (!offset) return
    // finger speed over the last few moves = the spring's starting velocity
    const [t0, p0] = samples[0], [t1, p1] = samples[samples.length - 1]
    const velocity = t1 > t0 ? ((p1 - p0) / (t1 - t0)) * 1000 : 0
    springBack(el, axis, offset, velocity)
    offset = 0
  }

  el.addEventListener('touchstart', onStart, { passive: true })
  el.addEventListener('touchmove', onMove, { passive: true })
  el.addEventListener('touchend', onEnd)
  el.addEventListener('touchcancel', onEnd)
  return () => {
    el.removeEventListener('touchstart', onStart)
    el.removeEventListener('touchmove', onMove)
    el.removeEventListener('touchend', onEnd)
    el.removeEventListener('touchcancel', onEnd)
  }
}
