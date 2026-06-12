import { useState, useMemo, useEffect } from 'react'
import { STAGES } from '../constants/stages'
import { useTargets } from '../hooks/useTargets'
import { useFunnelMetrics } from '../hooks/useFunnelMetrics'
import { useTagBreakdown } from '../hooks/useTagBreakdown'
import { useCustomDashboards, computeStageCounts } from '../hooks/useCustomDashboards'

function attainmentColor(pct) {
  if (pct >= 100) return '#22c55e'
  if (pct >= 70)  return '#6bbf6b'
  if (pct >= 40)  return '#f08a1c'
  return '#dc2626'
}

// ---- Actual vs Target row with progress bar ----
function TargetRow({ stage, actual, target, editing, draft, onDraftChange }) {
  const pct = target > 0 ? Math.min(999, Math.round((actual / target) * 100)) : null
  const barPct = target > 0 ? Math.min(100, (actual / target) * 100) : 0

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr 110px 110px 90px',
      gap: 16, alignItems: 'center',
      padding: '14px 16px',
      borderBottom: '1px solid var(--jh-line)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{stage.emoji}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                       color: stage.color }}>
          {stage.label}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg-soft)', borderRadius: 'var(--radius-pill)',
                    height: 22, position: 'relative', overflow: 'hidden',
                    border: '1px solid var(--jh-line)' }}>
        <div style={{
          width: `${barPct}%`, height: '100%',
          background: target > 0 ? attainmentColor(pct ?? 0) : 'var(--fg-4)',
          borderRadius: 'var(--radius-pill)',
          transition: 'width 400ms ease',
          opacity: 0.85,
        }} />
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--fg-1)',
        }}>
          {target > 0 ? `${pct}% of target` : 'no target set'}
        </span>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase',
                      fontWeight: 700, letterSpacing: '0.5px' }}>Actual</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>
          {actual.toLocaleString()}
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase',
                      fontWeight: 700, letterSpacing: '0.5px' }}>Target</div>
        {editing ? (
          <input
            type="number" min="0" className="filter-input"
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            style={{ width: 90, textAlign: 'right' }}
          />
        ) : (
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
                        color: target > 0 ? 'var(--fg-1)' : 'var(--fg-4)' }}>
            {target > 0 ? target.toLocaleString() : '—'}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'right' }}>
        {pct !== null && (
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
            color: attainmentColor(pct),
          }}>
            {pct}%
          </span>
        )}
      </div>
    </div>
  )
}

export default function TargetsPage() {
  const { targets, loading: targetsLoading, saveTargets } = useTargets()
  const { dashboards } = useCustomDashboards()
  const [scope, setScope] = useState('aarrr')
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  // Actuals — AARRR scope
  const { data: metrics, loading: metricsLoading } = useFunnelMetrics({})
  // Actuals — custom dashboard scope (tag sums)
  const { data: tagData, loading: tagsLoading } = useTagBreakdown({})

  const selectedDashboard = dashboards.find(d => d.id === scope)

  // Rows: [{ stage: {key,label,emoji,color}, actual }]
  const rows = useMemo(() => {
    if (scope === 'aarrr') {
      return STAGES.map(s => ({ stage: s, actual: metrics?.[s.key] ?? 0 }))
    }
    if (!selectedDashboard) return []
    return computeStageCounts(selectedDashboard.stages, tagData?.raw)
      .map(s => ({ stage: s, actual: s.count ?? 0 }))
  }, [scope, metrics, selectedDashboard, tagData])

  const scopeTargets = targets[scope] ?? {}

  // Reset drafts when scope changes or editing starts
  useEffect(() => {
    if (editing) {
      const next = {}
      for (const row of rows) {
        next[row.stage.key] = String(scopeTargets[row.stage.key]?.target_count ?? '')
      }
      setDrafts(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, scope])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const entries = rows
        .map(row => ({
          stage_key:    row.stage.key,
          target_count: Math.max(0, parseInt(drafts[row.stage.key] || '0', 10) || 0),
        }))
      await saveTargets(scope, entries)
      setEditing(false)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  const loading = targetsLoading || (scope === 'aarrr' ? metricsLoading : tagsLoading)

  // Summary
  const summary = useMemo(() => {
    const withTargets = rows.filter(r => (scopeTargets[r.stage.key]?.target_count ?? 0) > 0)
    if (!withTargets.length) return null
    const hit = withTargets.filter(r => r.actual >= scopeTargets[r.stage.key].target_count).length
    return { hit, total: withTargets.length }
  }, [rows, scopeTargets])

  return (
    <div>
      <div className="page-header">
        <h1>🎯 Targets</h1>
        <p>Set a target per funnel stage and track actual vs target</p>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label">Funnel</label>
          <select className="filter-select" value={scope}
            onChange={e => { setScope(e.target.value); setEditing(false) }}
            style={{ minWidth: 200 }}>
            <option value="aarrr">⚓ AAARRR Pirate Metrics</option>
            {dashboards.map(d => (
              <option key={d.id} value={d.id}>🧩 {d.name}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1 }} />
        {error && <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>}
        {editing ? (
          <>
            <button className="chart-toggle-btn" onClick={() => setEditing(false)}>Cancel</button>
            <button className="chart-toggle-btn active" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : '💾 Save targets'}
            </button>
          </>
        ) : (
          <button className="chart-toggle-btn active" onClick={() => setEditing(true)}>
            ✏️ Set targets
          </button>
        )}
      </div>

      <div className="chart-section">
        <div className="chart-section-header">
          <h2 className="chart-section-title">
            Actual vs Target — {scope === 'aarrr' ? 'AAARRR Pirate Metrics' : selectedDashboard?.name}
          </h2>
          {summary && (
            <span style={{ fontSize: 13, fontWeight: 600,
                           color: summary.hit === summary.total ? '#22c55e' : 'var(--fg-2)' }}>
              {summary.hit} of {summary.total} targets hit
            </span>
          )}
        </div>

        {loading ? (
          <div className="spinner-wrap"><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <p>This funnel has no stages yet. Build it first in Custom Dashboards.</p>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)',
                        overflow: 'hidden' }}>
            {rows.map(row => (
              <TargetRow
                key={row.stage.key}
                stage={row.stage}
                actual={row.actual}
                target={scopeTargets[row.stage.key]?.target_count ?? 0}
                editing={editing}
                draft={drafts[row.stage.key] ?? ''}
                onDraftChange={v => setDrafts(d => ({ ...d, [row.stage.key]: v }))}
              />
            ))}
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 12 }}>
          Attainment colour: <span style={{ color: '#dc2626' }}>■</span> &lt;40% ·{' '}
          <span style={{ color: '#f08a1c' }}>■</span> 40–69% ·{' '}
          <span style={{ color: '#6bbf6b' }}>■</span> 70–99% ·{' '}
          <span style={{ color: '#22c55e' }}>■</span> ≥100%
        </p>
      </div>
    </div>
  )
}
