import { STAGES } from '../constants/stages'

/**
 * AAARRR stage legend — plain-English definition of every stage, the raw
 * count, and the conversion rate INTO each stage from the one before it
 * (conversion is always measured between consecutive AAARRR stages).
 *
 * Acquisition, Activation and Retention are counted as unique people
 * (distinct email per stage) and carry a "unique people" badge.
 */
function convColor(pct) {
  if (pct === null) return 'var(--fg-3)'
  return pct < 20 ? '#dc2626' : pct < 50 ? '#f08a1c' : '#22c55e'
}

export default function StageLegend({ metrics }) {
  return (
    <div className="stage-legend">
      {STAGES.map((stage, i) => {
        const count     = metrics?.[stage.key] ?? null
        const prevStage = i === 0 ? null : STAGES[i - 1]
        const prevCount = prevStage ? (metrics?.[prevStage.key] ?? 0) : null

        // Conversion from the previous stage → this stage.
        const pct = prevStage
          ? (prevCount > 0 ? (count ?? 0) / prevCount * 100 : null)
          : null

        return (
          <div key={stage.key} className="stage-legend-row">
            <span className="stage-legend-dot" style={{ background: stage.color }} />

            <div className="stage-legend-body">
              <div className="stage-legend-head">
                <span className="stage-legend-name" style={{ color: stage.color }}>
                  {stage.emoji} {stage.label}
                </span>
                {stage.uniqueByEmail && (
                  <span className="stage-legend-badge">unique people · by email</span>
                )}
                {count !== null && (
                  <span className="stage-legend-count">{count.toLocaleString()}</span>
                )}
                {prevStage && (
                  <span className="stage-legend-conv">
                    <span style={{ color: convColor(pct), fontWeight: 700 }}>
                      {pct === null ? 'n/a' : `${pct.toFixed(1)}%`}
                    </span>
                    <span style={{ color: 'var(--fg-3)' }}>
                      {' '}from {prevStage.label.toLowerCase()}
                    </span>
                  </span>
                )}
              </div>
              <p className="stage-legend-desc">{stage.legend}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
