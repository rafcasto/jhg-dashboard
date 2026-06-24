import { Fragment } from 'react'
import { STAGES } from '../constants/stages'

/**
 * KPI cards — one card per AAARRR stage showing the stage count and a
 * plain-English description of what the stage measures. Between each pair
 * of cards an arrow shows the conversion rate from one stage into the next
 * (conversion is always measured between consecutive AAARRR stages).
 */
function convColor(pct) {
  if (pct === null) return 'var(--fg-3)'
  return pct < 20 ? '#dc2626' : pct < 50 ? '#f08a1c' : '#22c55e'
}

export default function KPICards({ metrics, loading }) {
  return (
    <div className="kpi-grid">
      {STAGES.map((stage, i) => {
        const count    = metrics?.[stage.key] ?? 0
        const nextStage = i < STAGES.length - 1 ? STAGES[i + 1] : null
        const nextCount = nextStage ? (metrics?.[nextStage.key] ?? 0) : null

        // Conversion INTO the next stage (shown on the connecting arrow).
        const pct = nextStage
          ? (count > 0 ? (nextCount / count) * 100 : null)
          : null

        return (
          <Fragment key={stage.key}>
            <div className="kpi-card" style={{ '--stage-color': stage.color }}>
              <div className="kpi-emoji">{stage.emoji}</div>
              <div className="kpi-label">{stage.label}</div>
              <div className="kpi-value">
                {loading ? '—' : count.toLocaleString()}
              </div>
              {stage.uniqueByEmail && (
                <span className="metric-badge">unique · by email</span>
              )}
              <p className="kpi-desc">{stage.legend}</p>
            </div>

            {nextStage && (
              <div className="kpi-arrow" aria-hidden="false">
                <span
                  className="kpi-arrow-pct"
                  style={{ color: convColor(loading ? null : pct) }}
                >
                  {loading ? '—' : pct === null ? 'n/a' : `${pct.toFixed(1)}%`}
                </span>
                <svg width="34" height="16" viewBox="0 0 34 16" fill="none"
                     stroke="currentColor" strokeWidth="2"
                     style={{ color: convColor(loading ? null : pct) }}>
                  <line x1="2" y1="8" x2="28" y2="8" />
                  <polyline points="24 3 30 8 24 13" />
                </svg>
                <span className="kpi-arrow-label">converted</span>
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
