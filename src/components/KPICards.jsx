import { Fragment } from 'react'
import { STAGES } from '../constants/stages'
import ExportButton from './ExportButton'

/**
 * AAARRR funnel KPI cards.
 *
 * Each card has a FIXED-HEIGHT stat zone (emoji · label · value · badge
 * slot) so every number sits on the same baseline across the row — which
 * lets the conversion arrows in the gaps align exactly to the numbers they
 * connect. A hairline divider separates the metric from its definition,
 * and a per-stage CSV export button sits at the bottom of each card.
 */
function convColor(pct) {
  if (pct === null) return 'var(--fg-3)'
  return pct < 20 ? '#dc2626' : pct < 50 ? '#f08a1c' : '#22c55e'
}

export default function KPICards({ metrics, loading, filters = {} }) {
  return (
    <div className="pm-funnel">
      {STAGES.map((stage, i) => {
        const count     = metrics?.[stage.key] ?? 0
        const nextStage = i < STAGES.length - 1 ? STAGES[i + 1] : null
        const nextCount = nextStage ? (metrics?.[nextStage.key] ?? 0) : null

        // Conversion INTO the next stage (shown on the connecting arrow).
        const pct = nextStage
          ? (count > 0 ? (nextCount / count) * 100 : null)
          : null
        const arrowColor = convColor(loading ? null : pct)

        return (
          <Fragment key={stage.key}>
            <article className="pm-card" style={{ '--c': stage.color }}>
              <div className="pm-card__stat">
                <div className="pm-card__head">
                  <span className="pm-card__emoji">{stage.emoji}</span>
                  <span className="pm-card__label">{stage.label}</span>
                </div>
                <div className="pm-card__value">
                  {loading ? '—' : count.toLocaleString()}
                </div>
                <div className="pm-card__badge-slot">
                  {stage.uniqueByEmail && (
                    <span className="pm-badge" title="Counted as unique people — distinct email per stage">
                      ◦ unique people
                    </span>
                  )}
                </div>
              </div>
              <p className="pm-card__desc">{stage.legend}</p>
              <ExportButton
                className="pm-card__export"
                label="⬇ Export CSV"
                filename={`${stage.label}-leads`}
                title={`Download unique ${stage.label} leads as CSV`}
                params={{
                  stage:        stage.key,
                  source:       filters.source    || undefined,
                  startDate:    filters.startDate || undefined,
                  endDate:      filters.endDate   || undefined,
                  uniqueByEmail: true,
                }}
              />
            </article>

            {nextStage && (
              <div className="pm-conn">
                <span className="pm-conn__pct" style={{ color: arrowColor }}>
                  {loading ? '—' : pct === null ? 'n/a' : `${pct.toFixed(1)}%`}
                </span>
                <svg className="pm-conn__arrow" width="48" height="12" viewBox="0 0 48 12"
                     fill="none" stroke={arrowColor} strokeWidth="1.75"
                     strokeLinecap="round" strokeLinejoin="round">
                  <line x1="2" y1="6" x2="40" y2="6" strokeDasharray="3 3" opacity="0.55" />
                  <polyline points="38 1.5 45 6 38 10.5" />
                </svg>
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
