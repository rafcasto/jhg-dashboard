import { STAGES, cumulativeMetrics } from '../constants/stages'

/**
 * KPI cards — conversion-rate first, cumulative funnel counts.
 * Counts are "reached this stage" (own stage + all later stages), so a
 * lead in Acquisition also counts toward Awareness. This keeps the cards
 * consistent with the funnel chart: the top stage is always 100%.
 */
export default function KPICards({ metrics, loading }) {
  const cum = cumulativeMetrics(metrics)

  return (
    <div className="kpi-grid" style={{ '--kpi-cols': 6 }}>
      {STAGES.map((stage, i) => {
        const count     = cum[stage.key] ?? 0
        const prevStage = i === 0 ? null : STAGES[i - 1]
        const prevCount = prevStage ? (cum[prevStage.key] ?? 0) : null

        // First card: everyone enters the funnel → 100%.
        // Others: conversion from previous stage (cumulative).
        const pct = prevStage
          ? (prevCount > 0 ? (count / prevCount) * 100 : null)
          : 100

        const pctColor = pct === null
          ? 'var(--fg-3)'
          : pct < 20 ? '#dc2626' : pct < 50 ? '#f08a1c' : '#22c55e'

        return (
          <div
            key={stage.key}
            className="kpi-card"
            style={{ '--stage-color': stage.color }}
          >
            <div className="kpi-emoji">{stage.emoji}</div>
            <div className="kpi-label">{stage.label}</div>
            <div className="kpi-value" style={{ color: pctColor }}>
              {loading
                ? '—'
                : pct === null ? 'n/a' : `${pct.toFixed(1)}%`}
            </div>
            <div className="kpi-conversion">
              <span style={{ fontWeight: 600, color: 'var(--fg-2)' }}>
                {loading ? '—' : count.toLocaleString()} reached
              </span>
              <span>
                {prevStage ? `from ${prevStage.label.toLowerCase()}` : 'top of funnel'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
