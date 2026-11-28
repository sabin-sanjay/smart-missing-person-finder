// useFadeEdges.js: for sideways-scrolling rows (carousels).
//
// 1. FADE: the row fades out at its edges with a CSS mask, but only on the
//    side where more items are hidden (start: right edge, middle: both,
//    end: left edge).
// 2. RUBBER BANDING + VELOCITY SPRING: pulling past the first or last item
//    stretches the row with resistance; letting go springs it back with a
//    real spring that starts at your finger's speed (lib/motion.js).
//
// Use:  const ref = useFadeEdges();  <div ref={ref} className="fade-x ...">

import { useEffect, useRef } from 'react'
import { attachRubberBand } from './motion'

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
    const detach = attachRubberBand(el, {
      axis: 'x',
      canPull: (d) => (d > 0 && el.scrollLeft <= 0) || (d < 0 && el.scrollLeft >= el.scrollWidth - el.clientWidth - 1),
    })

    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update) // screen turned, text size changed, items added
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      detach()
    }
  }, [])

  return ref
}
