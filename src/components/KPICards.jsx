import { STAGES } from '../constants/stages'

/**
 * KPI cards — raw per-stage counts (each lead is counted once, in its
 * current stage). The big value is the NUMBER of leads in the stage and
 * the conversion rate from the previous stage is shown underneath.
 */
export default function KPICards({ metrics, loading }) {
  return (
    <div className="kpi-grid" style={{ '--kpi-cols': 6 }}>
      {STAGES.map((stage, i) => {
        const count     = metrics?.[stage.key] ?? 0
        const prevStage = i === 0 ? null : STAGES[i - 1]
        const prevCount = prevStage ? (metrics?.[prevStage.key] ?? 0) : null

        // First card: top of funnel → 100%.
        // Others: conversion from the previous stage's count.
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
            <div className="kpi-value">
              {loading ? '—' : count.toLocaleString()}
            </div>
            <div className="kpi-conversion">
              <span style={{ fontWeight: 700, color: pctColor }}>
                {loading
                  ? '—'
                  : pct === null ? 'n/a' : `${pct.toFixed(1)}%`}
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
