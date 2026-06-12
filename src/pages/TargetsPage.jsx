import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../supabase'
import { STAGES, cumulativeMetrics, cumulativeStages } from '../constants/stages'
import { useTargets } from '../hooks/useTargets'
import { useCohorts, cohortStatus } from '../hooks/useCohorts'
import { useFunnelMetrics } from '../hooks/useFunnelMetrics'
import { useTagBreakdown } from '../hooks/useTagBreakdown'
import { useCustomDashboards, computeStageCounts } from '../hooks/useCustomDashboards'

function attainmentColor(pct) {
  if (pct >= 100) return '#22c55e'
  if (pct >= 70)  return '#6bbf6b'
  if (pct >= 40)  return '#f08a1c'
  return '#dc2626'
}

const STATUS_STYLE = {
  active:   { label: '● Active',   color: '#22c55e' },
  upcoming: { label: '◷ Upcoming', color: '#f08a1c' },
  ended:    { label: '■ Ended',    color: 'var(--fg-3)' },
}

function formatDate(d) {
  if (!d) return 'ongoing'
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---- Shared actual-vs-target progress row ----
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

// ============================================================
// Cohort actuals — fetch metrics for a cohort's date window
// ============================================================
function useCohortActuals(cohort, dashboard) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      const pStart = `${cohort.start_date}T00:00:00`
      const pEnd   = cohort.end_date ? `${cohort.end_date}T23:59:59.999` : null

      if (!cohort.dashboard_id) {
        // Main AARRR funnel
        const { data } = await supabase.rpc('aarrr_funnel_metrics', {
          p_start: pStart, p_end: pEnd, p_source: null,
        })
        if (cancelled) return
        const cum = cumulativeMetrics(data)
        setRows(STAGES.map(s => ({ stage: s, actual: cum[s.key] ?? 0 })))
      } else if (dashboard) {
        // Custom dashboard funnel
        const { data } = await supabase.rpc('aarrr_tag_breakdown', {
          p_start: pStart, p_end: pEnd, p_stage: null,
        })
        if (cancelled) return
        const stages = cumulativeStages(computeStageCounts(dashboard.stages, data))
        setRows(stages.map(s => ({ stage: s, actual: s.cum ?? 0 })))
      } else {
        setRows([])
      }
      setLoading(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [cohort.id, cohort.start_date, cohort.end_date, cohort.dashboard_id, dashboard])

  return { rows, loading }
}

// ---- One cohort card: header + actual-vs-target rows ----
function CohortCard({ cohort, dashboard, onEdit, onDelete }) {
  const { rows, loading } = useCohortActuals(cohort, dashboard)
  const status = cohortStatus(cohort)
  const st = STATUS_STYLE[status]

  const targets = cohort.targets ?? {}
  const summary = useMemo(() => {
    const withTargets = rows.filter(r => (targets[r.stage.key] ?? 0) > 0)
    if (!withTargets.length) return null
    const hit = withTargets.filter(r => r.actual >= targets[r.stage.key]).length
    return { hit, total: withTargets.length }
  }, [rows, targets])

  return (
    <div className="chart-section" style={{ marginBottom: 20 }}>
      <div className="chart-section-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 className="chart-section-title" style={{ margin: 0 }}>🧪 {cohort.name}</h2>
            <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{st.label}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              {formatDate(cohort.start_date)} → {formatDate(cohort.end_date)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              · {cohort.dashboard_id ? `🧩 ${dashboard?.name ?? 'custom'}` : '⚓ AAARRR'}
            </span>
          </div>
          {cohort.description && (
            <p style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 6, maxWidth: 640,
                        fontStyle: 'italic' }}>
              “{cohort.description}”
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {summary && (
            <span style={{ fontSize: 13, fontWeight: 600, marginRight: 8,
                           color: summary.hit === summary.total ? '#22c55e' : 'var(--fg-2)' }}>
              {summary.hit}/{summary.total} targets hit
            </span>
          )}
          <button className="chart-toggle-btn" onClick={onEdit}>✏️</button>
          <button className="chart-toggle-btn" onClick={onDelete}>🗑</button>
        </div>
      </div>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="empty-state"><p>The funnel this cohort referenced no longer exists.</p></div>
      ) : (
        <div style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)',
                      overflow: 'hidden' }}>
          {rows.map(row => (
            <TargetRow
              key={row.stage.key}
              stage={row.stage}
              actual={row.actual}
              target={targets[row.stage.key] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Cohort create/edit form ----
function CohortForm({ initial, dashboards, onSave, onCancel }) {
  const [name, setName]               = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [dashboardId, setDashboardId] = useState(initial?.dashboard_id ?? '')
  const [startDate, setStartDate]     = useState(initial?.start_date ?? '')
  const [endDate, setEndDate]         = useState(initial?.end_date ?? '')
  const [targets, setTargets]         = useState(
    Object.fromEntries(Object.entries(initial?.targets ?? {}).map(([k, v]) => [k, String(v)]))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const selectedDashboard = dashboards.find(d => d.id === dashboardId)
  const stageList = dashboardId
    ? (selectedDashboard?.stages ?? [])
    : STAGES

  async function handleSave() {
    if (!name.trim())  { setError('Name the cohort (e.g. "New landing page test").'); return }
    if (!startDate)    { setError('Set a start date.'); return }
    if (endDate && endDate < startDate) { setError('End date must be after start date.'); return }
    setSaving(true)
    setError(null)
    try {
      const cleanTargets = {}
      for (const s of stageList) {
        const v = Math.max(0, parseInt(targets[s.key] || '0', 10) || 0)
        if (v > 0) cleanTargets[s.key] = v
      }
      await onSave({
        name:         name.trim(),
        description:  description.trim(),
        dashboard_id: dashboardId || null,
        start_date:   startDate,
        end_date:     endDate || null,
        targets:      cleanTargets,
      })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="chart-section">
      <div className="chart-section-header">
        <h2 className="chart-section-title">
          {initial?.id ? `✏️ Edit cohort "${initial.name}"` : '🧪 New Cohort'}
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="filter-group">
          <label className="filter-label">Cohort name</label>
          <input type="text" className="filter-input" placeholder="e.g. New landing page test"
            value={name} onChange={e => setName(e.target.value)} style={{ width: 240 }} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Funnel</label>
          <select className="filter-select" value={dashboardId}
            onChange={e => { setDashboardId(e.target.value); setTargets({}) }}>
            <option value="">⚓ AAARRR Pirate Metrics</option>
            {dashboards.map(d => (
              <option key={d.id} value={d.id}>🧩 {d.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Start date</label>
          <input type="date" className="filter-input" value={startDate}
            onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="filter-label">End date (blank = ongoing)</label>
          <input type="date" className="filter-input" value={endDate}
            onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="filter-group" style={{ marginBottom: 20 }}>
        <label className="filter-label">What changed? (the change this cohort validates)</label>
        <textarea
          className="filter-input"
          placeholder="e.g. Rewrote the webinar RSVP confirmation email with a stronger CTA to the mixer event"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
                    textTransform: 'uppercase', color: 'var(--fg-3)' }}>
        Targets per stage (leads reaching the stage within the cohort window — leave 0 to skip)
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {stageList.map(s => (
          <div key={s.key} className="filter-group">
            <label className="filter-label" style={{ color: s.color }}>
              {s.emoji} {s.label}
            </label>
            <input type="number" min="0" className="filter-input"
              value={targets[s.key] ?? ''}
              placeholder="0"
              onChange={e => setTargets(t => ({ ...t, [s.key]: e.target.value }))}
              style={{ width: 110, textAlign: 'right' }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
        <div style={{ flex: 1 }} />
        {error && <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>}
        <button type="button" className="chart-toggle-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="chart-toggle-btn active" disabled={saving}
          onClick={handleSave}>
          {saving ? 'Saving…' : '💾 Save cohort'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Overall (all-time) targets tab — original behaviour
// ============================================================
function OverallTab() {
  const { targets, loading: targetsLoading, saveTargets } = useTargets()
  const { dashboards } = useCustomDashboards()
  const [scope, setScope] = useState('aarrr')
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const { data: metrics, loading: metricsLoading } = useFunnelMetrics({})
  const { data: tagData, loading: tagsLoading } = useTagBreakdown({})

  const selectedDashboard = dashboards.find(d => d.id === scope)

  const rows = useMemo(() => {
    if (scope === 'aarrr') {
      const cum = cumulativeMetrics(metrics)
      return STAGES.map(s => ({ stage: s, actual: cum[s.key] ?? 0 }))
    }
    if (!selectedDashboard) return []
    return cumulativeStages(computeStageCounts(selectedDashboard.stages, tagData?.raw))
      .map(s => ({ stage: s, actual: s.cum ?? 0 }))
  }, [scope, metrics, selectedDashboard, tagData])

  const scopeTargets = targets[scope] ?? {}

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
      const entries = rows.map(row => ({
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

  const summary = useMemo(() => {
    const withTargets = rows.filter(r => (scopeTargets[r.stage.key]?.target_count ?? 0) > 0)
    if (!withTargets.length) return null
    const hit = withTargets.filter(r => r.actual >= scopeTargets[r.stage.key].target_count).length
    return { hit, total: withTargets.length }
  }, [rows, scopeTargets])

  return (
    <>
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
      </div>
    </>
  )
}

// ============================================================
// Cohorts tab
// ============================================================
function CohortsTab() {
  const { cohorts, loading, createCohort, updateCohort, deleteCohort } = useCohorts()
  const { dashboards } = useCustomDashboards()
  const [editing, setEditing] = useState(null)   // null | 'new' | cohort object

  async function handleSave(payload) {
    if (editing === 'new') await createCohort(payload)
    else await updateCohort(editing.id, payload)
    setEditing(null)
  }

  async function handleDelete(c) {
    if (!window.confirm(`Delete cohort "${c.name}"?`)) return
    await deleteCohort(c.id)
  }

  if (editing) {
    return (
      <CohortForm
        initial={editing === 'new' ? null : editing}
        dashboards={dashboards}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <>
      <div className="filter-bar">
        <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>
          Each cohort measures leads created in its date window against per-stage targets —
          run several in parallel to validate different funnel changes.
        </span>
        <div style={{ flex: 1 }} />
        <button className="chart-toggle-btn active" onClick={() => setEditing('new')}>
          + New cohort
        </button>
      </div>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : cohorts.length === 0 ? (
        <div className="chart-section">
          <div className="empty-state">
            <p>No cohorts yet. Click <strong>+ New cohort</strong> to create your first
            experiment — e.g. <em>"New webinar CTA — 1–30 Jun"</em> — set per-stage targets,
            and track whether the change moved the numbers.</p>
          </div>
        </div>
      ) : (
        cohorts.map(c => (
          <CohortCard
            key={c.id}
            cohort={c}
            dashboard={dashboards.find(d => d.id === c.dashboard_id)}
            onEdit={() => setEditing(c)}
            onDelete={() => handleDelete(c)}
          />
        ))
      )}
    </>
  )
}

// ============================================================
// Page
// ============================================================
export default function TargetsPage() {
  const [tab, setTab] = useState('cohorts')

  return (
    <div>
      <div className="page-header">
        <h1>🎯 Targets</h1>
        <p>Set targets per funnel stage and validate changes with time-boxed cohorts</p>
      </div>

      <div className="chart-toggle-group" style={{ marginBottom: 20 }}>
        <button
          className={`chart-toggle-btn${tab === 'cohorts' ? ' active' : ''}`}
          onClick={() => setTab('cohorts')}
        >
          🧪 Cohorts
        </button>
        <button
          className={`chart-toggle-btn${tab === 'overall' ? ' active' : ''}`}
          onClick={() => setTab('overall')}
        >
          📈 Overall targets
        </button>
      </div>

      {tab === 'cohorts' ? <CohortsTab /> : <OverallTab />}
    </div>
  )
}
