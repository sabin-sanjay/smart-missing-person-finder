// useFadeEdges.js: makes a sideways-scrolling row (carousel) fade out at its
// edges with a CSS mask, but only on the side where more items are hidden:
//   - at the start: only the right edge fades ("there's more this way")
//   - in the middle: both edges fade
//   - at the end: only the left edge fades
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
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update) // screen turned, text size changed, items added
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  return ref
}
