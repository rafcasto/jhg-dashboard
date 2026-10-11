import { useState, useMemo } from 'react'
import { useCustomDashboards } from '../hooks/useCustomDashboards'
import { useTagBreakdown } from '../hooks/useTagBreakdown'
import { useIntegrations } from '../hooks/useIntegrations'
import { useExternalDaily } from '../hooks/useExternalDaily'
import { mergeSites } from '../constants/sites'
import { STAGE_SOURCES, LINKEDIN_METRICS, GA4_METRICS, DEFAULT_METRIC, stageSource } from '../constants/stageSources'
import { resolveStageCounts, externalNeeds } from '../lib/stageCounts'
import CustomFunnelChart from '../components/charts/CustomFunnelChart'
import CustomBarChart   from '../components/charts/CustomBarChart'
import CustomDonutChart from '../components/charts/CustomDonutChart'
import CustomTableView  from '../components/charts/CustomTableView'

const PALETTE = ['#7a1ec2', '#0033cc', '#6bbf6b', '#f5d000', '#f08a1c', '#2f7a3a', '#dc2626', '#0891b2']

const CHART_VIEWS = [
  { key: 'funnel', label: '🎯 Funnel' },
  { key: 'bar',    label: '📊 Bar'    },
  { key: 'donut',  label: '🍩 Mix'    },
  { key: 'table',  label: '📋 Table'  },
]

const EMPTY_STAGE = () => ({
  key:    crypto.randomUUID().slice(0, 8),
  label:  '',
  emoji:  '🔹',
  color:  PALETTE[0],
  source: 'tags',
  tags:   [],
})

// ---- Tag multi-select (checkbox list inside a collapsible) ----
function TagPicker({ allTags, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = allTags.filter(t =>
    t.tag.toLowerCase().includes(query.toLowerCase())
  )

  function toggle(tag) {
    onChange(selected.includes(tag)
      ? selected.filter(t => t !== tag)
      : [...selected, tag])
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="filter-input"
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', textAlign: 'left', minWidth: 220, maxWidth: 340,
                 overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {selected.length === 0
          ? 'Select tags…'
          : `${selected.length} tag${selected.length > 1 ? 's' : ''} selected`}
        <span style={{ float: 'right', color: 'var(--fg-3)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0,
          width: 380, maxHeight: 280, overflowY: 'auto',
          background: 'white', border: '1px solid var(--jh-line)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-2)', padding: 8,
        }}>
          <input
            type="text" className="filter-input" placeholder="Search tags…"
            value={query} onChange={e => setQuery(e.target.value)}
            style={{ width: '100%', marginBottom: 8 }}
          />
          {filtered.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--fg-4)', padding: 8 }}>No tags found.</p>
          )}
          {filtered.map(t => (
            <label key={t.tag} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', fontSize: 12, cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
              background: selected.includes(t.tag) ? 'var(--bg-tint)' : 'transparent',
            }}>
              <input
                type="checkbox"
                checked={selected.includes(t.tag)}
                onChange={() => toggle(t.tag)}
              />
              <span style={{ flex: 1, wordBreak: 'break-word' }}>{t.tag}</span>
              <span style={{ color: 'var(--fg-3)', flexShrink: 0 }}>{t.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- What a stage counts: tags, a LinkedIn metric, or a GA4 metric ----
function SourceControls({ stage, allTags, sites, onChange }) {
  const source = stageSource(stage)

  function setSource(next) {
    if (next === source) return
    onChange(next === 'tags'
      ? { source: 'tags', tags: stage.tags ?? [], metric: undefined, site: undefined }
      : { source: next, metric: DEFAULT_METRIC[next], site: undefined })
  }

  return (
    <>
      <div className="filter-group">
        <label className="filter-label">Counts</label>
        <select className="filter-select" value={source} onChange={e => setSource(e.target.value)}>
          {STAGE_SOURCES.map(s => (
            <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>
          ))}
        </select>
      </div>

      {source === 'tags' && (
        <div className="filter-group">
          <label className="filter-label">Tags counted in this stage</label>
          <TagPicker allTags={allTags} selected={stage.tags ?? []}
                     onChange={tags => onChange({ tags })} />
        </div>
      )}

      {source === 'linkedin' && (
        <div className="filter-group">
          <label className="filter-label">Metric</label>
          <select className="filter-select" value={stage.metric ?? DEFAULT_METRIC.linkedin}
                  onChange={e => onChange({ metric: e.target.value })}>
            {LINKEDIN_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
      )}

      {source === 'ga4' && (
        <>
          <div className="filter-group">
            <label className="filter-label">Metric</label>
            <select className="filter-select" value={stage.metric ?? DEFAULT_METRIC.ga4}
                    onChange={e => onChange({ metric: e.target.value })}>
              {GA4_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Site</label>
            <select className="filter-select" value={stage.site ?? ''}
                    onChange={e => onChange({ site: e.target.value || undefined })}>
              <option value="">All sites in the experiment</option>
              {sites.map(s => (
                <option key={s.key} value={s.key}>{s.emoji} {s.label}{s.connected ? '' : ' · not connected'}</option>
              ))}
            </select>
          </div>
        </>
      )}
    </>
  )
}

// ---- Builder form (create / edit) ----
function DashboardBuilder({ initial, allTags, sites, onSave, onCancel }) {
  const [name, setName]               = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [stages, setStages]           = useState(
    initial?.stages?.length ? initial.stages.map(s => ({ ...s })) : [EMPTY_STAGE()]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function setStage(idx, patch) {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }
  function move(idx, dir) {
    setStages(prev => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  function remove(idx) {
    setStages(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Give your dashboard a name (e.g. L-A-P-S).'); return }
    const valid = stages
      .filter(s => s.label.trim())
      .map(s => {
        // Keep only the fields that matter for the chosen source
        const source = stageSource(s)
        const base = { key: s.key, label: s.label.trim(), emoji: s.emoji, color: s.color, source }
        if (source === 'tags') return { ...base, tags: s.tags ?? [] }
        const out = { ...base, metric: s.metric ?? DEFAULT_METRIC[source] }
        if (source === 'ga4' && s.site) out.site = s.site
        return out
      })
    if (valid.length < 2) { setError('Add at least 2 stages with labels.'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), description: description.trim(), stages: valid })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="chart-section">
      <div className="chart-section-header">
        <h2 className="chart-section-title">
          {initial?.id ? `✏️ Edit "${initial.name}"` : '➕ New Custom Dashboard'}
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div className="filter-group">
          <label className="filter-label">Dashboard name</label>
          <input type="text" className="filter-input" placeholder="e.g. L-A-P-S"
            value={name} onChange={e => setName(e.target.value)} style={{ width: 220 }} />
        </div>
        <div className="filter-group" style={{ flex: 1 }}>
          <label className="filter-label">Description (optional)</label>
          <input type="text" className="filter-input" placeholder="Impressions → Visits → Leads → Placements"
            value={description} onChange={e => setDescription(e.target.value)} style={{ width: '100%' }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stages.map((stage, idx) => (
          <div key={stage.key} style={{
            display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
            padding: 12, border: '1px solid var(--jh-line)',
            borderLeft: `4px solid ${stage.color}`,
            borderRadius: 'var(--radius-md)', background: 'var(--bg-soft)',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                           color: 'var(--fg-3)', alignSelf: 'center', width: 24 }}>
              {idx + 1}.
            </span>

            <div className="filter-group">
              <label className="filter-label">Emoji</label>
              <input type="text" className="filter-input" value={stage.emoji}
                onChange={e => setStage(idx, { emoji: e.target.value })}
                style={{ width: 54, textAlign: 'center' }} />
            </div>

            <div className="filter-group">
              <label className="filter-label">Stage label</label>
              <input type="text" className="filter-input" placeholder="e.g. Leads"
                value={stage.label} onChange={e => setStage(idx, { label: e.target.value })}
                style={{ width: 160 }} />
            </div>

            <div className="filter-group">
              <label className="filter-label">Colour</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => setStage(idx, { color: c })}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', background: c,
                      border: stage.color === c ? '3px solid var(--fg-1)' : '2px solid white',
                      boxShadow: '0 0 0 1px var(--jh-line)', cursor: 'pointer', padding: 0,
                    }} />
                ))}
              </div>
            </div>

            <SourceControls stage={stage} allTags={allTags} sites={sites}
                            onChange={patch => setStage(idx, patch)} />

            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignSelf: 'center' }}>
              <button type="button" className="chart-toggle-btn" title="Move up"
                disabled={idx === 0} onClick={() => move(idx, -1)}>↑</button>
              <button type="button" className="chart-toggle-btn" title="Move down"
                disabled={idx === stages.length - 1} onClick={() => move(idx, 1)}>↓</button>
              <button type="button" className="chart-toggle-btn" title="Remove stage"
                disabled={stages.length <= 1} onClick={() => remove(idx)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 10 }}>
        <strong>Lead tags</strong> count leads created in the period. <strong>LinkedIn</strong> and{' '}
        <strong>Google Analytics</strong> stages sum the metric over the same period — inside an
        experiment that's the posting window, across the accounts and sites the experiment selects;
        on this page it's every connected account and site.
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        <button type="button" className="chart-toggle-btn"
          onClick={() => setStages(prev => [...prev, EMPTY_STAGE()])}>
          + Add stage
        </button>
        <div style={{ flex: 1 }} />
        {error && <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>}
        <button type="button" className="chart-toggle-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="chart-toggle-btn active" disabled={saving}
          onClick={handleSave}>
          {saving ? 'Saving…' : '💾 Save dashboard'}
        </button>
      </div>
    </div>
  )
}

// ---- Main page ----
export default function CustomDashboardsPage() {
  const { dashboards, loading, createDashboard, updateDashboard, deleteDashboard } = useCustomDashboards()
  const { ga4 } = useIntegrations()
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing]       = useState(null)   // null | 'new' | dashboard object
  const [chartView, setChartView]   = useState('funnel')
  const [filters, setFilters]       = useState({ startDate: '', endDate: '' })

  const sites = useMemo(() => mergeSites(ga4), [ga4])

  // All tags + counts (also drives the stage counts for the selected range)
  const { data: tagData, loading: tagsLoading } = useTagBreakdown({
    startDate: filters.startDate || undefined,
    endDate:   filters.endDate   || undefined,
  })

  const allTags = useMemo(() => {
    const totals = {}
    for (const row of tagData?.raw ?? []) {
      totals[row.tag] = (totals[row.tag] ?? 0) + row.count
    }
    return Object.entries(totals)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
  }, [tagData])

  const selected = dashboards.find(d => d.id === selectedId)
    ?? (dashboards.length ? dashboards[0] : null)

  // LinkedIn / GA4 sums for the same range — only fetched when a stage needs them
  const need = useMemo(() => externalNeeds(selected?.stages), [selected])
  const external = useExternalDaily({
    startDate: filters.startDate || undefined,
    endDate:   filters.endDate   || undefined,
    need,
  })

  const stagesWithCounts = useMemo(
    () => selected
      ? resolveStageCounts(selected.stages, { tagRows: tagData?.raw, linkedin: external.linkedin, ga4: external.ga4 })
      : [],
    [selected, tagData, external.linkedin, external.ga4]
  )
  const missing = stagesWithCounts.filter(s => s.noData)

  async function handleSave(payload) {
    if (editing === 'new') {
      const created = await createDashboard(payload)
      setSelectedId(created.id)
    } else {
      await updateDashboard(editing.id, payload)
    }
    setEditing(null)
  }

  async function handleDelete(d) {
    if (!window.confirm(`Delete dashboard "${d.name}"? This cannot be undone.`)) return
    await deleteDashboard(d.id)
    if (selectedId === d.id) setSelectedId(null)
  }

  return (
    <div>
      <div className="page-header">
        <h1>🧩 Custom Dashboards</h1>
        <p>Build your own funnel by combining lead tags, LinkedIn metrics and site traffic into stages</p>
      </div>

      {editing ? (
        <DashboardBuilder
          initial={editing === 'new' ? null : editing}
          allTags={allTags}
          sites={sites}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          {/* Dashboard selector + actions */}
          <div className="filter-bar">
            <div className="filter-group">
              <label className="filter-label">Dashboard</label>
              <select className="filter-select"
                value={selected?.id ?? ''}
                onChange={e => setSelectedId(e.target.value)}
                style={{ minWidth: 180 }}>
                {dashboards.length === 0 && <option value="">No dashboards yet</option>}
                {dashboards.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">From</label>
              <input type="date" className="filter-input" value={filters.startDate}
                onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="filter-group">
              <label className="filter-label">To</label>
              <input type="date" className="filter-input" value={filters.endDate}
                onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} />
            </div>

            <div style={{ flex: 1 }} />
            {selected && (
              <>
                <button className="chart-toggle-btn" onClick={() => setEditing(selected)}>
                  ✏️ Edit
                </button>
                <button className="chart-toggle-btn" onClick={() => handleDelete(selected)}>
                  🗑 Delete
                </button>
              </>
            )}
            <button className="chart-toggle-btn active" onClick={() => setEditing('new')}>
              + New dashboard
            </button>
          </div>

          {/* Visualisation */}
          <div className="chart-section">
            {loading || tagsLoading || external.loading ? (
              <div className="spinner-wrap"><div className="spinner" /></div>
            ) : !selected ? (
              <div className="empty-state">
                <p>No custom dashboards yet. Click <strong>+ New dashboard</strong> to build
                your first one — for example <strong>Impressions → Visits → Leads → Placements</strong> —
                mixing lead tags with LinkedIn and Google Analytics metrics.</p>
              </div>
            ) : (
              <>
                <div className="chart-section-header">
                  <div>
                    <h2 className="chart-section-title">{selected.name}</h2>
                    {selected.description && (
                      <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>{selected.description}</span>
                    )}
                  </div>
                  <div className="chart-toggle-group">
                    {CHART_VIEWS.map(v => (
                      <button
                        key={v.key}
                        className={`chart-toggle-btn${chartView === v.key ? ' active' : ''}`}
                        onClick={() => setChartView(v.key)}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                {missing.length > 0 && (
                  <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 12px' }}>
                    ⚠️ No {missing.map(s => stageSource(s) === 'linkedin' ? 'LinkedIn' : 'Google Analytics')
                              .filter((v, i, a) => a.indexOf(v) === i).join(' / ')} data for this period
                    ({missing.map(s => s.label).join(', ')} show 0). Import or sync in Settings.
                  </p>
                )}

                {chartView === 'funnel' && (
                  <CustomFunnelChart
                    stages={stagesWithCounts}
                  />
                )}
                {chartView === 'bar'   && <CustomBarChart   stages={stagesWithCounts} />}
                {chartView === 'donut' && <CustomDonutChart stages={stagesWithCounts} />}
                {chartView === 'table' && (
                  <CustomTableView
                    stages={stagesWithCounts}
                    sites={sites}
                    filters={filters}
                    namePrefix={selected.name}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
