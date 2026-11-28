// useFadeEdges.js: for sideways-scrolling rows (carousels).
//
// 1. FADE: the row fades out at its edges with a CSS mask, but only on the
//    side where more items are hidden (start: right edge, middle: both,
//    end: left edge).
// 2. RUBBER BANDING: if you pull past the first or last item, the row
//    stretches a little with resistance and springs back when you let go
//    (like iPhone lists; Android doesn't do this by itself).
//
// Use:  const ref = useFadeEdges();  <div ref={ref} className="fade-x ...">

import { useEffect, useRef } from 'react'

export default function useFadeEdges() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      el.classList.toggle('fade-left', el.scrollLeft > 2)
      el.classList.toggle('fade-right', el.scrollLeft < max - 2)
    }

    // ---- rubber banding ----
    let startX = null
    const onStart = (e) => { startX = e.touches[0].clientX; el.style.transition = 'none' }
    const onMove = (e) => {
      if (startX == null) return
      const dx = e.touches[0].clientX - startX
      const max = el.scrollWidth - el.clientWidth
      const atStart = el.scrollLeft <= 0 && dx > 0
      const atEnd = el.scrollLeft >= max - 1 && dx < 0
      if (atStart || atEnd) {
        // resistance: the further you pull, the less it moves (max ~48px)
        const pull = Math.sign(dx) * 48 * (1 - Math.exp(-Math.abs(dx) / 120))
        el.style.transform = `translateX(${pull}px)`
      }
    }
    const onEnd = () => {
      startX = null
      el.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)' // spring back with a small overshoot
      el.style.transform = ''
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    const ro = new ResizeObserver(update) // screen turned, text size changed, items added
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      ro.disconnect()
    }
  }, [])

  return ref
}
