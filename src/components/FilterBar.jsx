import { STAGES } from '../constants/stages'

const STAGE_OPTIONS = [
  { value: '', label: 'All Stages' },
  ...STAGES.map(s => ({ value: s.key, label: `${s.emoji} ${s.label}` })),
]

export default function FilterBar({ filters, onChange }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value })
  }

  function reset() {
    onChange({ startDate: '', endDate: '', source: '', stage: '' })
  }

  const hasFilters = filters.startDate || filters.endDate || filters.source || filters.stage

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label className="filter-label">From</label>
        <input type="date" className="filter-input" value={filters.startDate}
          onChange={e => set('startDate', e.target.value)} />
      </div>

      <div className="filter-group">
        <label className="filter-label">To</label>
        <input type="date" className="filter-input" value={filters.endDate}
          onChange={e => set('endDate', e.target.value)} />
      </div>

      <div className="filter-group">
        <label className="filter-label">Stage</label>
        <select className="filter-select" value={filters.stage}
          onChange={e => set('stage', e.target.value)}>
          {STAGE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Source</label>
        <input type="text" className="filter-input" placeholder="e.g. linkedin"
          value={filters.source} onChange={e => set('source', e.target.value)}
          style={{ width: 130 }} />
      </div>

      {hasFilters && (
        <button className="filter-reset" onClick={reset}>✕ Clear filters</button>
      )}
    </div>
  )
}
