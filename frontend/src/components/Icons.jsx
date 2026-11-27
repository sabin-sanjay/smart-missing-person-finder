// Icons.jsx: small, thin line icons drawn in code (no icon library to download).
// Use like: <Icon name="search" className="w-5 h-5" />
// They take the text colour of whatever they sit in (stroke="currentColor").

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  map: 'M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4zm0 0v13m6-10.5v13',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7.5 9a7.5 7.5 0 0 1 15 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4-4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zm4 3a2 2 0 0 0 4 0',
  arrow: 'M7 17 17 7M9 7h8v8',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3m8-4a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-4 4.5c.8-1.6 2.3-2.5 4-2.5s3.2.9 4 2.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4.5l3 2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z',
  chevron: 'M9 6l6 6-6 6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9a6 6 0 0 1 12 0m1-9a3 3 0 1 0 0-6m2.5 15a5.5 5.5 0 0 0-3-4.9',
}

export default function Icon({ name, className = 'w-5 h-5', strokeWidth = 1.6 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
