import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { STAGES } from '../constants/stages'
import { AWARENESS_COLOR, mergeSites } from '../constants/sites'
import { useTargets } from '../hooks/useTargets'
import { useExperiments, experimentStatus } from '../hooks/useExperiments'
import { useIntegrations } from '../hooks/useIntegrations'
import { useExperimentImpact } from '../hooks/useExperimentImpact'
import { useFunnelMetrics } from '../hooks/useFunnelMetrics'
import { useTagBreakdown } from '../hooks/useTagBreakdown'
import { useCustomDashboards, computeStageCounts } from '../hooks/useCustomDashboards'
import { formatDate, daysBetween } from '../lib/experimentWindow'
import ImpactChart from '../components/experiments/ImpactChart'
import { StatTile, TileGroup } from '../components/experiments/ImpactTiles'

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>{stage.emoji}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                       color: stage.color }}>
          {stage.label}
        </span>
        {stage.uniqueByEmail && (
          <span className="metric-badge"
                title="Counted as unique people (distinct email per stage)">
            unique · by email
          </span>
        )}
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
// Funnel actuals — leads created inside the posting window
// ============================================================
function useExperimentActuals(exp, dashboard) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      const pStart = `${exp.start_date}T00:00:00`
      const pEnd   = exp.end_date ? `${exp.end_date}T23:59:59.999` : null

      if (!exp.dashboard_id) {
        const { data } = await supabase.rpc('aarrr_funnel_metrics', {
          p_start: pStart, p_end: pEnd, p_source: null,
        })
        if (cancelled) return
        setRows(STAGES.map(s => ({ stage: s, actual: data?.[s.key] ?? 0 })))
      } else if (dashboard) {
        const { data } = await supabase.rpc('aarrr_tag_breakdown', {
          p_start: pStart, p_end: pEnd, p_stage: null,
        })
        if (cancelled) return
        const stages = computeStageCounts(dashboard.stages, data)
        setRows(stages.map(s => ({ stage: s, actual: s.count ?? 0 })))
      } else {
        setRows([])
      }
      setLoading(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [exp.id, exp.start_date, exp.end_date, exp.dashboard_id, dashboard])

  return { rows, loading }
}

// ============================================================
// One experiment card: posting window → awareness → downstream → funnel
// ============================================================
function ExperimentCard({ exp, dashboard, sites, channels, onEdit, onDelete }) {
  const impact = useExperimentImpact(exp)
  const { rows, loading } = useExperimentActuals(exp, dashboard)
  const status = experimentStatus(exp)
  const st = STATUS_STYLE[status]

  const chosenChannels = channels.filter(c => (exp.channels ?? []).includes(c.id))
  const chosenSites    = sites.filter(s => (exp.downstream_sites ?? []).includes(s.key))
  const measuring      = chosenChannels.length > 0 || chosenSites.length > 0

  const targets = exp.targets ?? {}
  const summary = useMemo(() => {
    const withTargets = rows.filter(r => (targets[r.stage.key] ?? 0) > 0)
    if (!withTargets.length) return null
    const hit = withTargets.filter(r => r.actual >= targets[r.stage.key]).length
    return { hit, total: withTargets.length }
  }, [rows, targets])

  const aw = impact.awareness
  const panels = [
    chosenChannels.length > 0 && {
      key: 'awareness', title: '👀 LinkedIn impressions', color: AWARENESS_COLOR,
      data: aw.daily.map(d => ({ date: d.date, value: d.impressions })),
      before: aw.before.impressions, after: aw.after.impressions, empty: !aw.hasData,
    },
    ...chosenSites.map(s => {
      const site = impact.sites[s.key]
      return site && {
        key: s.key, title: `${s.emoji} ${s.label} sessions`, color: s.color,
        data: site.daily.map(d => ({ date: d.date, value: d.sessions })),
        before: site.before.sessions, after: site.after.sessions, empty: !site.hasData,
        note: !s.connected ? 'not connected — add this site in Settings' : null,
      }
    }),
  ]

  return (
    <div className="chart-section" style={{ marginBottom: 20 }}>
      <div className="chart-section-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 className="chart-section-title" style={{ margin: 0 }}>🧪 {exp.name}</h2>
            <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{st.label}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              Posting {formatDate(exp.start_date)} → {formatDate(exp.end_date)}
              {exp.end_date && ` (${daysBetween(exp.start_date, exp.end_date)}d)`}
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              · {exp.dashboard_id ? `🧩 ${dashboard?.name ?? 'custom'}` : '⚓ AAARRR'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {chosenChannels.map(c => (
              <span key={c.id} className="chip" style={{ '--c': AWARENESS_COLOR }}>in {c.label}</span>
            ))}
            {chosenSites.map(s => (
              <span key={s.key} className="chip" style={{ '--c': s.color }}>{s.emoji} {s.label}</span>
            ))}
          </div>
          {exp.description && (
            <p style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 8, maxWidth: 680, fontStyle: 'italic' }}>
              “{exp.description}”
            </p>
          )}
          {exp.hypothesis && (
            <p style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 4, maxWidth: 680 }}>
              Expected: {exp.hypothesis}
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

      {/* ---- Impact: posting window vs baseline ---- */}
      {!measuring ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>No channels or downstream sites selected — edit this experiment to pick the LinkedIn
             accounts that were posting and the sites (EEC, Webinar, Compass…) to measure.</p>
        </div>
      ) : impact.loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
                        color: 'var(--fg-3)', marginBottom: 10 }}>
            Posting window vs the {impact.window.baseDays} days before
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
            {chosenChannels.length > 0 && (
              <TileGroup title="👀 Awareness — LinkedIn" color={AWARENESS_COLOR}
                         note={!aw.hasData ? 'no data yet — sync accounts in Settings' : null}>
                <StatTile label="Posts published" emoji="📝" color={AWARENESS_COLOR}
                          before={aw.before.posts} after={aw.after.posts} />
                <StatTile label="Impressions" emoji="👁" color={AWARENESS_COLOR}
                          before={aw.before.impressions} after={aw.after.impressions} />
                <StatTile label="Engagements" emoji="💬" color={AWARENESS_COLOR}
                          before={aw.before.engagements} after={aw.after.engagements}
                          hint="likes + comments + reposts + clicks" />
              </TileGroup>
            )}
            {chosenSites.map(s => {
              const site = impact.sites[s.key]
              if (!site) return null
              return (
                <TileGroup key={s.key} title={`${s.emoji} ${s.label}`} color={s.color}
                           note={!s.connected ? 'not connected' : !site.hasData ? 'no data yet — sync in Settings' : null}>
                  <StatTile label="Sessions" emoji="🧭" color={s.color}
                            before={site.before.sessions} after={site.after.sessions} />
                  <StatTile label="Users" emoji="👤" color={s.color}
                            before={site.before.users} after={site.after.users} />
                  <StatTile label="New users" emoji="✨" color={s.color}
                            before={site.before.new_users} after={site.after.new_users} />
                  <StatTile label="Key events" emoji="🎯" color={s.color}
                            before={site.before.key_events} after={site.after.key_events}
                            hint="GA4 conversions" />
                </TileGroup>
              )
            })}
          </div>

          <ImpactChart window={impact.window} panels={panels} />

          {aw.posts.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--fg-2)' }}>
                {aw.posts.length} post{aw.posts.length === 1 ? '' : 's'} published in the window
              </summary>
              <div className="data-table-wrap" style={{ marginTop: 8 }}>
                <table className="data-table">
                  <thead><tr><th>Published</th><th>Post</th><th style={{ textAlign: 'right' }}>Impressions</th><th style={{ textAlign: 'right' }}>Engagements</th></tr></thead>
                  <tbody>
                    {aw.posts.map(p => (
                      <tr key={p.post_id}>
                        <td>{formatDate(p.published_at?.slice(0, 10))}</td>
                        <td>{p.post_url ? <a href={p.post_url} target="_blank" rel="noreferrer">{p.title ?? p.post_url}</a> : (p.title ?? '—')}</td>
                        <td style={{ textAlign: 'right' }}>{(p.impressions ?? 0).toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>{(p.engagements ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      {/* ---- Funnel targets ---- */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
                    color: 'var(--fg-3)', margin: '20px 0 8px' }}>
        Funnel — leads created in the posting window
      </div>
      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="empty-state"><p>The funnel this experiment referenced no longer exists.</p></div>
      ) : (
        <div style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {rows.map(row => (
            <TargetRow key={row.stage.key} stage={row.stage} actual={row.actual}
                       target={targets[row.stage.key] ?? 0} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Experiment create/edit form
// ============================================================
function PillToggle({ active, color, onClick, children, title }) {
  return (
    <button type="button" title={title}
      className={`chart-toggle-btn${active ? ' active' : ''}`}
      style={active && color ? { background: color, borderColor: color } : undefined}
      onClick={onClick}>
      {children}
    </button>
  )
}

function ExperimentForm({ initial, dashboards, sites, channels, onSave, onCancel }) {
  const [name, setName]               = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [hypothesis, setHypothesis]   = useState(initial?.hypothesis ?? '')
  const [dashboardId, setDashboardId] = useState(initial?.dashboard_id ?? '')
  const [startDate, setStartDate]     = useState(initial?.start_date ?? '')
  const [endDate, setEndDate]         = useState(initial?.end_date ?? '')
  const [baselineDays, setBaselineDays] = useState(initial?.baseline_days ? String(initial.baseline_days) : '')
  const [selChannels, setSelChannels] = useState(initial?.channels ?? [])
  const [selSites, setSelSites]       = useState(initial?.downstream_sites ?? [])
  const [targets, setTargets]         = useState(
    Object.fromEntries(Object.entries(initial?.targets ?? {}).map(([k, v]) => [k, String(v)]))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const selectedDashboard = dashboards.find(d => d.id === dashboardId)
  const stageList = dashboardId ? (selectedDashboard?.stages ?? []) : STAGES

  const toggle = (list, set, v) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  async function handleSave() {
    if (!name.trim())  { setError('Name the experiment (e.g. "Daily LinkedIn posting — October").'); return }
    if (!startDate)    { setError('Set a posting start date.'); return }
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
        name:             name.trim(),
        description:      description.trim(),
        hypothesis:       hypothesis.trim(),
        dashboard_id:     dashboardId || null,
        start_date:       startDate,
        end_date:         endDate || null,
        baseline_days:    parseInt(baselineDays, 10) > 0 ? parseInt(baselineDays, 10) : null,
        channels:         selChannels,
        downstream_sites: selSites,
        targets:          cleanTargets,
      })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const windowLen = startDate && endDate && endDate >= startDate ? daysBetween(startDate, endDate) : null

  return (
    <div className="chart-section">
      <div className="chart-section-header">
        <h2 className="chart-section-title">
          {initial?.id ? `✏️ Edit experiment "${initial.name}"` : '🧪 New Experiment'}
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="filter-group">
          <label className="filter-label">Experiment name</label>
          <input type="text" className="filter-input" placeholder="e.g. Daily LinkedIn posting — October"
            value={name} onChange={e => setName(e.target.value)} style={{ width: 260 }} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Posting starts</label>
          <input type="date" className="filter-input" value={startDate}
            onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Posting ends (blank = ongoing)</label>
          <input type="date" className="filter-input" value={endDate}
            onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Baseline (days before)</label>
          <input type="number" min="1" className="filter-input" value={baselineDays}
            placeholder={windowLen ? `${windowLen} (same as window)` : 'same as window'}
            onChange={e => setBaselineDays(e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="filter-group">
          <label className="filter-label">What are you doing in this window?</label>
          <textarea className="filter-input" rows={2}
            placeholder="e.g. One LinkedIn post per weekday from Rafael + the company page, all pointing to the EEC page"
            value={description} onChange={e => setDescription(e.target.value)}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Expected impact (hypothesis)</label>
          <textarea className="filter-input" rows={2}
            placeholder="e.g. EEC sessions up 30% and 10+ webinar sign-ups vs the previous 30 days"
            value={hypothesis} onChange={e => setHypothesis(e.target.value)}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
      </div>

      <div className="filter-group" style={{ marginBottom: 16 }}>
        <label className="filter-label">
          👀 Awareness — LinkedIn accounts posting
          <span style={{ fontWeight: 400, color: 'var(--fg-3)' }}> (impressions & engagement)</span>
        </label>
        {channels.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--fg-3)' }}>
            No LinkedIn accounts connected yet — <Link to="/settings">connect one in Settings</Link>.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {channels.map(c => (
              <PillToggle key={c.id} color={AWARENESS_COLOR} active={selChannels.includes(c.id)}
                          onClick={() => toggle(selChannels, setSelChannels, c.id)}
                          title={c.config?.author_name ?? c.label}>
                in {c.label}{c.status === 'error' ? ' ⚠️' : ''}
              </PillToggle>
            ))}
          </div>
        )}
      </div>

      <div className="filter-group" style={{ marginBottom: 20 }}>
        <label className="filter-label">
          🌐 Downstream sites to measure
          <span style={{ fontWeight: 400, color: 'var(--fg-3)' }}> (Google Analytics sessions, users, key events)</span>
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {sites.map(s => (
            <PillToggle key={s.key} color={s.color} active={selSites.includes(s.key)}
                        onClick={() => toggle(selSites, setSelSites, s.key)}
                        title={s.connected ? `GA4 connected` : 'Not connected yet — add in Settings'}>
              {s.emoji} {s.label}{!s.connected ? ' · not connected' : ''}
            </PillToggle>
          ))}
          <Link to="/settings" style={{ fontSize: 12 }}>+ add site</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, alignItems: 'flex-end' }}>
        <div className="filter-group">
          <label className="filter-label">Lead funnel</label>
          <select className="filter-select" value={dashboardId}
            onChange={e => { setDashboardId(e.target.value); setTargets({}) }}>
            <option value="">⚓ AAARRR Pirate Metrics</option>
            {dashboards.map(d => (
              <option key={d.id} value={d.id}>🧩 {d.name}</option>
            ))}
          </select>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
                       color: 'var(--fg-3)', paddingBottom: 9 }}>
          Targets per stage (leads created in the window — leave 0 to skip)
        </span>
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
          {saving ? 'Saving…' : '💾 Save experiment'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Overall (all-time) targets tab
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
      return STAGES.map(s => ({ stage: s, actual: metrics?.[s.key] ?? 0 }))
    }
    if (!selectedDashboard) return []
    return computeStageCounts(selectedDashboard.stages, tagData?.raw)
      .map(s => ({ stage: s, actual: s.count ?? 0 }))
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
            {scope === 'aarrr' && (
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500,
                             color: 'var(--fg-3)', marginTop: 4 }}>
                Acquisition, Activation &amp; Retention are counted as unique people (distinct email per stage)
              </span>
            )}
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
// Experiments tab
// ============================================================
function ExperimentsTab() {
  const { experiments, loading, createExperiment, updateExperiment, deleteExperiment } = useExperiments()
  const { dashboards } = useCustomDashboards()
  const { linkedin, ga4 } = useIntegrations()
  const sites = useMemo(() => mergeSites(ga4), [ga4])
  const [editing, setEditing] = useState(null)   // null | 'new' | experiment

  async function handleSave(payload) {
    if (editing === 'new') await createExperiment(payload)
    else await updateExperiment(editing.id, payload)
    setEditing(null)
  }

  async function handleDelete(x) {
    if (!window.confirm(`Delete experiment "${x.name}"?`)) return
    await deleteExperiment(x.id)
  }

  if (editing) {
    return (
      <ExperimentForm
        initial={editing === 'new' ? null : editing}
        dashboards={dashboards}
        sites={sites}
        channels={linkedin}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <>
      <div className="filter-bar">
        <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>
          Each experiment is a posting window. We compare it with the period just before it:
          LinkedIn reach → traffic on EEC / Webinar / Compass → leads in the funnel.
        </span>
        <div style={{ flex: 1 }} />
        <button className="chart-toggle-btn active" onClick={() => setEditing('new')}>
          + New experiment
        </button>
      </div>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : experiments.length === 0 ? (
        <div className="chart-section">
          <div className="empty-state">
            <p>No experiments yet. Click <strong>+ New experiment</strong>, set a posting window —
            e.g. <em>"Daily LinkedIn posts — 1–31 Oct"</em> — pick the accounts posting and the
            sites to watch, and see whether the push moved the numbers downstream.</p>
          </div>
        </div>
      ) : (
        experiments.map(x => (
          <ExperimentCard
            key={x.id}
            exp={x}
            dashboard={dashboards.find(d => d.id === x.dashboard_id)}
            sites={sites}
            channels={linkedin}
            onEdit={() => setEditing(x)}
            onDelete={() => handleDelete(x)}
          />
        ))
      )}
    </>
  )
}

// ============================================================
// Page
// ============================================================
export default function ExperimentsPage() {
  const [tab, setTab] = useState('experiments')

  return (
    <div>
      <div className="page-header">
        <h1>🧪 Experiments</h1>
        <p>Time-box a posting push, then see its impact on awareness, downstream sites and the lead funnel</p>
      </div>

      <div className="chart-toggle-group" style={{ marginBottom: 20 }}>
        <button
          className={`chart-toggle-btn${tab === 'experiments' ? ' active' : ''}`}
          onClick={() => setTab('experiments')}
        >
          🧪 Experiments
        </button>
        <button
          className={`chart-toggle-btn${tab === 'overall' ? ' active' : ''}`}
          onClick={() => setTab('overall')}
        >
          📈 Overall targets
        </button>
      </div>

      {tab === 'experiments' ? <ExperimentsTab /> : <OverallTab />}
    </div>
  )
}
