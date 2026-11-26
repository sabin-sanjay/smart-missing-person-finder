// dates.js: date helpers.

import i18n from '../i18n'

// The current date-time in the format a <input type="datetime-local"> wants,
// in the phone's local time: "2026-11-26T21:30"
export function nowForInput() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// "5 min ago", "3 hours ago", "2 days ago", in the chosen language
export function timeAgo(dateString) {
  const minutes = Math.round((Date.now() - new Date(dateString).getTime()) / 60000)
  if (minutes < 1) return i18n.t('time.justNow')
  if (minutes < 60) return i18n.t('time.minutes', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return i18n.t('time.hours', { count: hours })
  return i18n.t('time.days', { count: Math.round(hours / 24) })
}
