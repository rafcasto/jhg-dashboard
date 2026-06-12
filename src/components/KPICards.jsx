import { STAGES } from '../constants/stages'

/**
 * KPI cards — conversion-rate first.
 * The BIG number on each card is the conversion rate from the previous
 * stage; the lead count is demoted to the small sub-line.
 * The first stage (Awareness) has no previous stage, so it shows its
 * share of total leads instead.
 */
export default function KPICards({ metrics, loading }) {
  const total = metrics?.total ?? 0

  return (
    <div className="kpi-grid" style={{ '--kpi-cols': 6 }}>
      {STAGES.map((stage, i) => {
        const count     = metrics?.[stage.key] ?? 0
        const prevStage = i === 0 ? null : STAGES[i - 1]
        const prevCount = prevStage ? (metrics?.[prevStage.key] ?? 0) : null

        // First card: % of all leads. Others: conversion from previous stage.
        const pct = prevStage
          ? (prevCount > 0 ? (count / prevCount) * 100 : null)
          : (total > 0 ? (count / total) * 100 : null)

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
                {loading ? '—' : count.toLocaleString()} leads
              </span>
              <span>
                {prevStage ? `from ${prevStage.label.toLowerCase()}` : 'of total'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
