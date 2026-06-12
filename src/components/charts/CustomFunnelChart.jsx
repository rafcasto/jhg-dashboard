/**
 * CustomFunnelChart — generic funnel for user-defined stages.
 * stages: [{ key, label, emoji, color, count }]
 * Conversion rate between stages is the emphasized metric.
 */
export default function CustomFunnelChart({ stages }) {
  if (!stages?.length) return <div className="empty-state"><p>No stages defined yet</p></div>

  const maxCount = Math.max(1, ...stages.map(s => s.count ?? 0))

  return (
    <div className="funnel-wrap">
      {stages.map((stage, i) => {
        const count     = stage.count ?? 0
        const prevCount = i === 0 ? null : (stages[i - 1].count ?? 0)
        const pct       = prevCount === null
          ? null
          : prevCount > 0 ? Math.round((count / prevCount) * 100) : 0
        const widthPct  = Math.max(28, Math.round((count / maxCount) * 100))

        return (
          <div key={stage.key ?? i} style={{ width: '100%', maxWidth: 740 }}>
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

            {i < stages.length - 1 && (
              <div className="funnel-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {(() => {
                  const nextCount = stages[i + 1].count ?? 0
                  const convPct   = count > 0 ? Math.round((nextCount / count) * 100) : 0
                  return (
                    <span style={{
                      fontWeight: 700, fontSize: 14,
                      color: convPct < 20 ? '#dc2626' : convPct < 50 ? '#f08a1c' : '#22c55e',
                    }}>
                      {convPct}% converted
                    </span>
                  )
                })()}
              </div>
            )}
          </div>
        )
      })}

      {(stages[0]?.count ?? 0) > 0 && stages.length > 1 && (
        <div style={{
          marginTop: 20, padding: '10px 20px',
          background: 'var(--bg-tint)', borderRadius: 'var(--radius-sm)',
          fontSize: 13, color: 'var(--fg-2)', textAlign: 'center',
        }}>
          Overall conversion ({stages[0].label} → {stages[stages.length - 1].label}):&nbsp;
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--fg-1)' }}>
            {Math.round(((stages[stages.length - 1].count ?? 0) / Math.max(1, stages[0].count)) * 100)}%
          </strong>
        </div>
      )}
    </div>
  )
}
