// Celebrate.jsx: the "peak" moment after something important succeeds
// (sighting sent, found person registered, person reunited).
// PEAK-END RULE: people remember an experience by its best moment and its
// end, so we make that moment warm: a check mark that draws itself, and a
// small burst of confetti that flies out on curved paths (ARCS), with a
// little overshoot as it settles (FOLLOW-THROUGH).

const PIECES = Array.from({ length: 14 }, (_, i) => i)
const COLORS = ['#ff3b40', '#ffffff', '#ffb3b5', '#ffd23f']

export default function Celebrate({ size = 84 }) {
  return (
    <div className="celebrate" style={{ width: size, height: size }} aria-hidden="true">
      {PIECES.map((i) => {
        const angle = (i / PIECES.length) * 360
        return (
          <span
            key={i}
            className="confetti"
            style={{ '--a': `${angle}deg`, '--d': `${size * (0.75 + (i % 3) * 0.18)}px`, '--c': COLORS[i % COLORS.length], '--i': i }}
          />
        )
      })}
      <svg viewBox="0 0 52 52" className="celebrate-check">
        <circle cx="26" cy="26" r="24" fill="none" />
        <path d="M15 27l7 7 15-16" fill="none" />
      </svg>
    </div>
  )
}
