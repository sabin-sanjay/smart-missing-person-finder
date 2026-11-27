// Art.jsx: small "helping" illustrations, drawn with SVG code.
// No image files to download, so they cost almost nothing on slow internet,
// and they stay sharp on every screen size.
//
//   <PeopleChain />  people holding hands (one in red = the person we look for)
//   <HeartPulse />   a glowing heart with a heartbeat line (care, reunited)
//   <AlertRings />   rings spreading from a map pin (alerts reaching people)
//
// All are decoration only (aria-hidden), so screen readers skip them.

const RED = '#ff2a32'

// People holding hands, joined in a chain. The middle one glows red.
export function PeopleChain({ className = '' }) {
  const xs = [26, 78, 130, 182, 234]
  return (
    <svg viewBox="0 0 260 96" className={className} aria-hidden="true" fill="none">
      <defs>
        <radialGradient id="pc-glow">
          <stop offset="0" stopColor={RED} stopOpacity="0.55" />
          <stop offset="1" stopColor={RED} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="130" cy="50" r="46" fill="url(#pc-glow)" />
      {/* the joined arms between neighbours */}
      {xs.slice(0, -1).map((x) => (
        <path key={x} d={`M${x + 12} 52 Q${x + 26} 64 ${x + 40} 52`} stroke="white" strokeOpacity="0.85" strokeWidth="3" strokeLinecap="round" />
      ))}
      {xs.map((x, i) => {
        const mid = i === 2
        return (
          <g key={x}>
            <circle cx={x} cy="22" r="9.5" fill={mid ? RED : 'white'} fillOpacity={mid ? 1 : 0.85} />
            <path d={`M${x - 15} 88 Q${x - 15} 38 ${x} 37 Q${x + 15} 38 ${x + 15} 88 Z`}
              fill={mid ? RED : 'white'} fillOpacity={mid ? 1 : 0.16} stroke="white" strokeOpacity={mid ? 0 : 0.55} strokeWidth="1.5" />
          </g>
        )
      })}
    </svg>
  )
}

// A glowing heart with a heartbeat line running through it (care, life, reunited)
export function HeartPulse({ className = '' }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden="true" fill="none">
      <defs>
        <radialGradient id="hp-glow">
          <stop offset="0" stopColor={RED} stopOpacity="0.6" />
          <stop offset="1" stopColor={RED} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hp-heart" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6a70" />
          <stop offset="1" stopColor="#c80c14" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="50" r="48" fill="url(#hp-glow)" />
      <path d="M60 86 C22 62 18 30 38 22 C49 18 57 25 60 33 C63 25 71 18 82 22 C102 30 98 62 60 86 Z" fill="url(#hp-heart)" />
      <path d="M40 30 C44 26 50 26 53 30" stroke="white" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" />
      {/* heartbeat line */}
      <path d="M2 54 H40 L47 42 L54 68 L63 28 L71 54 H118" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Rings spreading out from a map pin (2 km, 5 km, 10 km)
export function AlertRings({ className = '' }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" fill="none">
      <circle cx="100" cy="100" r="96" stroke="white" strokeOpacity="0.07" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="68" stroke="white" strokeOpacity="0.1" strokeWidth="1.5" strokeDasharray="4 6" />
      <circle cx="100" cy="100" r="40" stroke={RED} strokeOpacity="0.45" strokeWidth="2" />
      <circle cx="100" cy="100" r="40" fill={RED} fillOpacity="0.08" />
      <path d="M100 118 C90 104 86 98 86 90 A14 14 0 0 1 114 90 C114 98 110 104 100 118 Z" fill={RED} />
      <circle cx="100" cy="90" r="5" fill="#0b0a0b" />
    </svg>
  )
}
