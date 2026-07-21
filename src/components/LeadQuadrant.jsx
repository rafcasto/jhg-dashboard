import { SEGMENTS, UNKNOWN_FIT, CELL_AT } from '../constants/quadrant'
import { usePeopleQuadrant } from '../hooks/usePeopleData'

function Cell({ seg, count, pct, active, onPick }) {
  return (
    <button
      onClick={() => onPick(seg)}
      style={{
        position: 'relative', textAlign: 'left',
        border: `1px solid ${active ? seg.color : 'var(--jh-line)'}`,
        outline: active ? `2px solid ${seg.color}` : 'none',
        borderRadius: 'var(--radius-md)', padding: '16px 18px',
        background: `${seg.color}0d`, cursor: 'pointer',
        minHeight: 150, display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'outline 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{seg.emoji}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: seg.color }}>
          {seg.title}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', fontStyle: 'italic' }}>{seg.tagline}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28 }}>
          {count.toLocaleString()}
        </span>
        <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{pct}% of scored</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.4, marginTop: 2 }}>
        {seg.action}
      </div>
    </button>
  )
}

export default function LeadQuadrant({ picked, onPick }) {
  const { data, loading, error } = usePeopleQuadrant()

  if (error) return null
  if (loading || !data) {
    return (
      <div className="chart-section" style={{ marginBottom: 20 }}>
        <div className="spinner-wrap"><div className="spinner" /></div>
      </div>
    )
  }

  const counts = Object.fromEntries((data.segments ?? []).map(s => [s.segment, s.count]))
  const scored = data.scored || 0
  const pct = n => (scored > 0 ? Math.round((n / scored) * 100) : 0)

  // is a given segment currently the active filter?
  const isActive = key => picked?.fit != null && CELL_AT[`${picked.intent}-${picked.fit}`] === key

  // grid cells in visual order: [top-left, top-right, bottom-left, bottom-right]
  const cells = [
    { intent: 'high', fit: 'low'  }, // qualify
    { intent: 'high', fit: 'high' }, // priority
    { intent: 'low',  fit: 'low'  }, // disqualify
    { intent: 'low',  fit: 'high' }, // nurture
  ]

  const unknownActive = picked?.fit === 'unknown'

  return (
    <div className="chart-section" style={{ marginBottom: 20 }}>
      <div className="chart-section-header">
        <h2 className="chart-section-title">
          🧭 Lead-score quadrant
          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginTop: 4 }}>
            Buying intent (≥{data.thresholds.intent} = high) × fit from the quiz (≥{data.thresholds.fit} = high).
            Click a cell to filter the list below. {data.scored.toLocaleString()} of {data.total_people.toLocaleString()} people have a fit score.
          </span>
        </h2>
        {(picked?.fit != null) && (
          <button className="chart-toggle-btn" onClick={() => onPick(null)}>Clear filter ✕</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'stretch', flexWrap: 'wrap' }}>
        {/* Y axis label */}
        <div style={{
          display: 'flex', alignItems: 'center', writingMode: 'vertical-rl',
          transform: 'rotate(180deg)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--fg-3)',
        }}>
          ← Buying intent →
        </div>

        <div style={{ flex: 1, minWidth: 460 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 12,
          }}>
            {cells.map(c => {
              const key = CELL_AT[`${c.intent}-${c.fit}`]
              const seg = SEGMENTS[key]
              const n = counts[key] ?? 0
              return (
                <Cell
                  key={key}
                  seg={seg}
                  count={n}
                  pct={pct(n)}
                  active={isActive(key)}
                  onPick={() => onPick(isActive(key) ? null : { fit: c.fit, intent: c.intent })}
                />
              )
            })}
          </div>

          {/* X axis label */}
          <div style={{
            display: 'flex', justifyContent: 'center', marginTop: 10,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
            textTransform: 'uppercase', color: 'var(--fg-3)',
          }}>
            ← Low fit · High fit → &nbsp;·&nbsp; Fit (right = better ICP match)
          </div>
        </div>

        {/* Unknown-fit bucket, alongside — not part of the quadrant */}
        <button
          onClick={() => onPick(unknownActive ? null : { fit: 'unknown', intent: null })}
          style={{
            width: 220, textAlign: 'left', cursor: 'pointer',
            border: `1px solid ${unknownActive ? UNKNOWN_FIT.color : 'var(--jh-line)'}`,
            outline: unknownActive ? `2px solid ${UNKNOWN_FIT.color}` : 'none',
            borderRadius: 'var(--radius-md)', padding: '16px 18px',
            background: `${UNKNOWN_FIT.color}0d`,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{UNKNOWN_FIT.emoji}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: UNKNOWN_FIT.color }}>
              {UNKNOWN_FIT.title}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', fontStyle: 'italic' }}>{UNKNOWN_FIT.tagline}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28 }}>
              {(data.unknown_fit || 0).toLocaleString()}
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              {data.total_people > 0 ? Math.round((data.unknown_fit / data.total_people) * 100) : 0}% of all
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.4, marginTop: 2 }}>
            {UNKNOWN_FIT.action}
          </div>
        </button>
      </div>
    </div>
  )
}
