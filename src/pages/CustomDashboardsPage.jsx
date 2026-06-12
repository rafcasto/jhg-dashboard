import { useState, useMemo } from 'react'
import { useCustomDashboards, computeStageCounts } from '../hooks/useCustomDashboards'
import { useTagBreakdown } from '../hooks/useTagBreakdown'
import { cumulativeStages } from '../constants/stages'
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
  key:   crypto.randomUUID().slice(0, 8),
  label: '',
  emoji: '🔹',
  color: PALETTE[0],
  tags:  [],
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

// ---- Builder form (create / edit) ----
function DashboardBuilder({ initial, allTags, onSave, onCancel }) {
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
    const valid = stages.filter(s => s.label.trim())
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
          <input type="text" className="filter-input" placeholder="Lead → Applicant → Placement → Success"
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

            <div className="filter-group">
              <label className="filter-label">Tags counted in this stage</label>
              <TagPicker
                allTags={allTags}
                selected={stage.tags ?? []}
                onChange={tags => setStage(idx, { tags })}
              />
            </div>

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
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing]       = useState(null)   // null | 'new' | dashboard object
  const [chartView, setChartView]   = useState('funnel')
  const [filters, setFilters]       = useState({ startDate: '', endDate: '' })

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

  // Raw counts per stage + cumulative "reached" counts
  const stagesWithCounts = useMemo(
    () => selected
      ? cumulativeStages(computeStageCounts(selected.stages, tagData?.raw))
      : [],
    [selected, tagData]
  )

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
        <p>Build your own funnel (e.g. L-A-P-S) by grouping lead tags into stages</p>
      </div>

      {editing ? (
        <DashboardBuilder
          initial={editing === 'new' ? null : editing}
          allTags={allTags}
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
            {loading || tagsLoading ? (
              <div className="spinner-wrap"><div className="spinner" /></div>
            ) : !selected ? (
              <div className="empty-state">
                <p>No custom dashboards yet. Click <strong>+ New dashboard</strong> to build
                your first one — for example <strong>L-A-P-S</strong> — and map your lead
                tags to each stage.</p>
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

                {chartView === 'funnel' && (
                  <CustomFunnelChart
                    stages={stagesWithCounts.map(s => ({ ...s, count: s.cum }))}
                  />
                )}
                {chartView === 'bar'   && <CustomBarChart   stages={stagesWithCounts} />}
                {chartView === 'donut' && <CustomDonutChart stages={stagesWithCounts} />}
                {chartView === 'table' && <CustomTableView  stages={stagesWithCounts} />}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
