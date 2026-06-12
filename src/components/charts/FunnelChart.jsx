import { STAGES, cumulativeMetrics } from '../../constants/stages'

/**
 * Funnel — cumulative "reached this stage" counts, so the top of the
 * funnel equals total leads (100%) and each arrow shows the conversion
 * INTO the next stage (fixes the previous off-by-one arrow labels).
 */
export default function FunnelChart({ metrics }) {
  if (!metrics) return <div className="empty-state"><p>No data yet</p></div>

  const cum      = cumulativeMetrics(metrics)
  const maxCount = Math.max(1, cum[STAGES[0].key] ?? 0)

  return (
    <div className="funnel-wrap">
      {STAGES.map((stage, i) => {
        const count    = cum[stage.key] ?? 0
        const widthPct = Math.max(28, Math.round((count / maxCount) * 100))

        // Conversion INTO the next stage (shown under this bar)
        const nextCount = i < STAGES.length - 1 ? (cum[STAGES[i + 1].key] ?? 0) : null
        const convPct   = nextCount === null
          ? null
          : count > 0 ? Math.round((nextCount / count) * 100) : 0

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

            {convPct !== null && (
              <div className="funnel-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span style={{ fontWeight: 600, color: convPct < 20 ? '#dc2626' : convPct < 50 ? '#f08a1c' : '#22c55e' }}>
                  {convPct}% converted
                </span>
              </div>
            )}
          </div>
        )
      })}

      {(cum.awareness ?? 0) > 0 && (
        <div style={{
          marginTop: 20, padding: '10px 20px',
          background: 'var(--bg-tint)', borderRadius: 'var(--radius-sm)',
          fontSize: 13, color: 'var(--fg-2)', textAlign: 'center',
        }}>
          Overall funnel conversion (Awareness → Revenue):&nbsp;
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--fg-1)' }}>
            {Math.round(((cum.revenue ?? 0) / Math.max(1, cum.awareness ?? 1)) * 100)}%
          </strong>
        </div>
      )}
    </div>
  )
}
