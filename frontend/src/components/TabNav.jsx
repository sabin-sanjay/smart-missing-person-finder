// TabNav.jsx: the app's menu, in two shapes from one piece of code.
//
//   variant="bottom"  phones: a glass tab bar at the bottom (icon above name)
//   variant="top"     tablets/computers: a glass pill menu in the top bar
//                     (icon beside name)
//
// In both, a glowing glass bubble glides to the open page's tab, and tabs
// light up smoothly when the mouse moves over them.

import { NavLink } from 'react-router'
import Icon from './Icons'

export default function TabNav({ items, active, variant = 'bottom', className = '' }) {
  const n = items.length
  const top = variant === 'top'
  // the bubble is as wide as one tab; the bar's inner padding is 6px (bottom) or 4px (top)
  const gap = top ? 8 : 12

  return (
    <ul
      className={`${top ? 'tabbar tabbar-top' : 'tabbar'} ${className}`}
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      {active >= 0 && (
        <li
          className="tab-indicator"
          aria-hidden="true"
          style={{ width: `calc((100% - ${gap}px) / ${n})`, transform: `translateX(${active * 100}%)` }}
        />
      )}
      {items.map((item) => (
        <li key={item.to}>
          {/* NavLink knows which page is open. "end" = Home only on exactly "/". */}
          <NavLink
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `tab ${top ? 'tab-top' : ''} ${isActive ? 'tab-active' : ''}`}
          >
            <Icon name={item.icon} className={top ? 'w-[18px] h-[18px]' : 'w-[21px] h-[21px]'} strokeWidth={1.8} />
            <span>{item.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
