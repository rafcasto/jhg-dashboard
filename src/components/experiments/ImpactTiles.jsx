import { fmtNum, pctChange } from '../../lib/experimentWindow'

/** Before/after stat tile. Direction is carried by icon + text, never colour alone. */
export function StatTile({ label, emoji, color, before, after, hint }) {
  const pct = pctChange(before, after)
  const up = pct !== null && pct > 0.5
  const down = pct !== null && pct < -0.5
  const deltaColor = up ? '#166534' : down ? '#b91c1c' : 'var(--fg-3)'

  return (
    <div className="stat-tile" style={{ '--c': color }}>
      <div className="stat-tile__label">{emoji} {label}</div>
      <div className="stat-tile__value">{fmtNum(after)}</div>
      <div className="stat-tile__delta" style={{ color: deltaColor }}>
        {pct === null
          ? (before === 0 && after === 0 ? 'no data' : 'no baseline')
          : `${up ? '▲' : down ? '▼' : '■'} ${Math.abs(pct).toFixed(0)}%`}
        <span className="stat-tile__before"> · {fmtNum(before)} before</span>
      </div>
      {hint && <div className="stat-tile__hint">{hint}</div>}
    </div>
  )
}

export function TileGroup({ title, color, children, note }) {
  return (
    <div className="tile-group">
      <div className="tile-group__title" style={{ color }}>
        {title}
        {note && <span className="tile-group__note">{note}</span>}
      </div>
      <div className="tile-grid">{children}</div>
    </div>
  )
}
