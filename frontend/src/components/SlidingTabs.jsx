// SlidingTabs.jsx: a row of equal tabs inside a frosted-glass capsule.
// The chosen tab sits on a white pill that glides smoothly to whichever
// tab you tap.
//
// Use:
//   <SlidingTabs
//     options={[{ value: 'all', label: 'All' }, { value: 'recent', label: 'Last 24 h' }]}
//     value={filter}
//     onChange={setFilter}
//     label="Filter cases"        // read out by screen readers
//   />

export default function SlidingTabs({ options, value, onChange, label }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const n = options.length

  return (
    <div className="seg" role="tablist" aria-label={label} style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {/* the white pill that slides under the chosen tab */}
      <span
        className="seg-pill"
        aria-hidden="true"
        style={{ width: `calc((100% - 8px) / ${n})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={'seg-tab' + (o.value === value ? ' seg-tab-on' : '')}
        >
          {o.label}
          {o.count != null && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
