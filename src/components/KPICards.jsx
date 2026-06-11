import { STAGES } from '../constants/stages'

export default function KPICards({ metrics, loading }) {
  return (
    <div className="kpi-grid" style={{ '--kpi-cols': 6 }}>
      {STAGES.map((stage, i) => {
        const count     = metrics?.[stage.key] ?? 0
        const prevCount = i === 0 ? null : (metrics?.[STAGES[i - 1].key] ?? 0)
        const convPct   = prevCount > 0 ? Math.round((count / prevCount) * 100) : null

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
              {convPct !== null ? (
                <>
                  <span className="kpi-conversion-rate"
                    style={{ color: convPct < 20 ? '#dc2626' : convPct < 50 ? '#f08a1c' : '#22c55e' }}>
                    {convPct}%
                  </span>
                  <span>from {STAGES[i - 1].label.toLowerCase()}</span>
                </>
              ) : (
                <span style={{ fontSize: 11, lineHeight: 1.3 }}>{stage.question}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
