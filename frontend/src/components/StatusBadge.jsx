// StatusBadge.jsx — a small coloured label showing a case's status.

// The words come from the translation files (status.pending etc.).

import { useTranslation } from 'react-i18next'

const colours = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-red-100 text-red-800',
  rejected: 'bg-slate-200 text-slate-700',
  found: 'bg-green-100 text-green-800',
}

export default function StatusBadge({ status }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-1 rounded ${colours[status] ?? 'bg-slate-100'}`}>
      {t(`status.${status}`, status)}
    </span>
  )
}
