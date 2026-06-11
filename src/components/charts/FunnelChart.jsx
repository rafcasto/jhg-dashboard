import { STAGES } from '../../constants/stages'

export default function FunnelChart({ metrics }) {
  if (!metrics) return <div className="empty-state"><p>No data yet</p></div>

  const firstCount = metrics[STAGES[0].key] ?? 0
  const maxCount   = Math.max(1, firstCount)

  return (
    <div className="funnel-wrap">
      {STAGES.map((stage, i) => {
        const count     = metrics[stage.key] ?? 0
        const prevCount = i === 0 ? maxCount : (metrics[STAGES[i - 1].key] ?? 0)
        const pct       = prevCount > 0 ? Math.round((count / prevCount) * 100) : 0
        const widthPct  = maxCount > 0
          ? Math.max(28, Math.round((count / maxCount) * 100))
          : 100 - (i * 12)

        return (
          <div key={stage.key} style={{ width: '100%', maxWidth: 740 }}>
            <div className="funnel-stage">
              <span className="funnel-side-label">{stage.emoji} {stage.label}</span>
              <div className="funnel-bar-wrap">
                <div
                  className="funnel-bar"
                  style={{ width: `${widthPct}%`, background: stage.color, minWidth: 80 }}
                >
                  <span style={{ fontSize: 17, fontWeight: 800 }}>{count.toLocaleString()}</span>
                </div>
              </div>
              <span className="funnel-side-count">{count.toLocaleString()}</span>
            </div>

            {i < STAGES.length - 1 && (
              <div className="funnel-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span style={{ fontWeight: 600, color: pct < 20 ? '#dc2626' : pct < 50 ? '#f08a1c' : '#22c55e' }}>
                  {pct}% converted
                </span>
              </div>
            )}
          </div>
        )
      })}

      {(metrics.awareness ?? 0) > 0 && (
        <div style={{
          marginTop: 20, padding: '10px 20px',
          background: 'var(--bg-tint)', borderRadius: 'var(--radius-sm)',
          fontSize: 13, color: 'var(--fg-2)', textAlign: 'center',
        }}>
          Overall funnel conversion (Awareness → Revenue):&nbsp;
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--fg-1)' }}>
            {Math.round(((metrics.revenue ?? 0) / Math.max(1, metrics.awareness ?? 1)) * 100)}%
          </strong>
        </div>
      )}
    </div>
  )
}
