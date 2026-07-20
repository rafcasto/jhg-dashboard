import { useState } from 'react'
import { STAGES, STAGE_MAP } from '../constants/stages'
import { intentBand, intentBarPct } from '../constants/intent'
import { usePeopleList, usePersonTimeline } from '../hooks/usePeopleData'

const CHURN_META = { key: 'churn', label: 'Churn', emoji: '🪦', color: '#dc2626' }
const stageMeta = key => STAGE_MAP[key] ?? (key === 'churn' ? CHURN_META : { label: key, emoji: '•', color: 'var(--fg-3)' })
const FILTER_STAGES = [...STAGES, CHURN_META]

const SORTS = [
  { key: 'intent',       label: '🔥 Intent' },
  { key: 'interactions', label: '⚡ Interactions' },
  { key: 'last_seen',    label: '🕐 Last seen' },
  { key: 'first_seen',   label: '📅 First seen' },
  { key: 'decayed',      label: '🥶 Most decayed' },
]

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: '2-digit' })
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-NZ', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function StageBadge({ stage }) {
  const m = stageMeta(stage)
  return (
    <span className="stage-badge" style={{ background: m.color }}>
      {m.emoji} {stage}
    </span>
  )
}

function IntentPill({ score }) {
  const v = Number(score ?? 0)
  const band = intentBand(v)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--bg-soft)', overflow: 'hidden', minWidth: 40 }}>
        <div style={{ width: `${intentBarPct(v)}%`, height: '100%', background: band.color, borderRadius: 999 }} />
      </div>
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15,
        color: band.color, minWidth: 38, textAlign: 'right',
      }}>
        {v > 0 ? `+${v}` : v}
      </span>
      <span style={{ fontSize: 13 }} title={`${band.label} — ${band.description}`}>{band.emoji}</span>
    </div>
  )
}

// ============================================================
// Expanded interaction timeline for one person
// ============================================================
function Timeline({ email, data, loading }) {
  if (loading) {
    return <div className="spinner-wrap" style={{ padding: 24 }}><div className="spinner" /></div>
  }
  if (!data) return null
  if (data.error) {
    return <div style={{ padding: 16, color: '#dc2626', fontSize: 13 }}>Couldn’t load timeline: {data.error}</div>
  }

  const events = data.timeline ?? []
  const person = data.person ?? {}

  return (
    <div style={{ padding: '16px 20px 20px', background: 'var(--bg-soft)' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
        color: 'var(--fg-3)', marginBottom: 12,
      }}>
        {events.length} interaction{events.length === 1 ? '' : 's'} · {person.distinct_tags} distinct behaviour{person.distinct_tags === 1 ? '' : 's'}
      </div>

      <div style={{ position: 'relative', paddingLeft: 18, borderLeft: '2px solid var(--jh-line)' }}>
        {events.map(e => {
          const m = stageMeta(e.stage)
          return (
            <div key={e.id} style={{
              display: 'grid', gridTemplateColumns: '150px 110px 1fr 90px',
              gap: 12, alignItems: 'center', padding: '8px 0',
              borderBottom: '1px solid var(--jh-line)',
              opacity: e.counted || !e.ntag ? 1 : 0.55,
            }}>
              <div style={{ fontSize: 12, color: 'var(--fg-3)', position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: -25, top: 5, width: 8, height: 8,
                  borderRadius: '50%', background: m.color, border: '2px solid var(--bg-1, #fff)',
                }} />
                {fmtDateTime(e.created_at)}
              </div>

              <div><StageBadge stage={e.stage} /></div>

              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={e.tag ?? ''}>
                  {e.ntag ?? <span style={{ color: 'var(--fg-4)' }}>(no tag)</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 2 }}>
                  {e.source ?? '—'}
                  {(e.matched_rules ?? []).length > 0 && (
                    <> · {e.matched_rules.map(r => r.label).join(' + ')}</>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                {!e.ntag ? (
                  <span style={{ fontSize: 11, color: 'var(--fg-4)' }}>—</span>
                ) : e.counted ? (
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15,
                    color: e.points_contributed > 0 ? '#16a34a'
                         : e.points_contributed < 0 ? '#dc2626' : 'var(--fg-4)',
                  }}>
                    {e.points_contributed > 0 ? `+${e.points_contributed}` : e.points_contributed}
                  </span>
                ) : (
                  <span
                    style={{ fontSize: 11, color: 'var(--fg-4)', fontStyle: 'italic' }}
                    title={`Repeat #${e.occurrence} of this behaviour — distinct scoring counts it once`}
                  >
                    repeat · +0
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Arithmetic, so the score is auditable */}
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--jh-line)',
        display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--fg-2)',
        alignItems: 'center',
      }}>
        <span>
          Stage <strong>{person.effective_stage}</strong>
          {person.is_churned
            ? ' (churned — most recent event)'
            : person.furthest_stage !== person.latest_stage
              ? ` (furthest reached; latest event was ${person.latest_stage})`
              : ''}
        </span>
        <span>
          + distinct tags{' '}
          <strong>{person.tag_points > 0 ? `+${person.tag_points}` : person.tag_points}</strong>
        </span>
        <span>
          = subtotal{' '}
          <strong>{person.intent_before_decay > 0 ? `+${person.intent_before_decay}` : person.intent_before_decay}</strong>
        </span>
        {person.decay_penalty !== 0 && (
          <span style={{ color: '#dc2626' }}>
            − inactive {person.months_inactive} mo{' '}
            <strong>{person.decay_penalty}</strong>
          </span>
        )}
        <span>
          = intent{' '}
          <strong style={{ color: intentBand(person.intent_score).color, fontSize: 14 }}>
            {person.intent_score > 0 ? `+${person.intent_score}` : person.intent_score}
          </strong>
        </span>
      </div>
    </div>
  )
}

// ============================================================
// Page
// ============================================================
export default function PeoplePage() {
  const [search, setSearch]       = useState('')
  const [stage, setStage]         = useState('')
  const [minIntent, setMinIntent] = useState('')
  const [sort, setSort]           = useState('intent')
  const [expanded, setExpanded]   = useState(null)

  const { rows, total, totalPeople, page, setPage, totalPages, loading, error } =
    usePeopleList({ search, stage, minIntent, sort })
  const { cache, loading: tlLoading, load } = usePersonTimeline()

  function toggle(email) {
    if (expanded === email) { setExpanded(null); return }
    setExpanded(email)
    load(email)
  }

  return (
    <div>
      <div className="page-header">
        <h1>👥 People</h1>
        <p>
          Unique leads, deduplicated by email — one row per person, scored on their
          furthest stage plus distinct behaviours. Click anyone to see every interaction.
        </p>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label">Search</label>
          <input
            type="text" className="filter-input" placeholder="Name or email…"
            value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Stage</label>
          <select className="filter-select" value={stage} onChange={e => setStage(e.target.value)}>
            <option value="">All stages</option>
            {FILTER_STAGES.map(s => (
              <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Min intent</label>
          <input
            type="number" className="filter-input" placeholder="any"
            value={minIntent} onChange={e => setMinIntent(e.target.value)}
            style={{ width: 90, textAlign: 'right' }}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Sort by</label>
          <select className="filter-select" value={sort} onChange={e => setSort(e.target.value)}>
            {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="chart-section">
          <div className="empty-state">
            <p style={{ color: '#dc2626' }}>
              Couldn’t load people: {error}
              <br />
              <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                Migrations 013 and 014 may not be applied yet.
              </span>
            </p>
          </div>
        </div>
      )}

      <div className="table-section">
        <div className="table-header">
          <span className="table-title">👥 Unique leads</span>
          <span className="table-count" style={{ marginLeft: 'auto' }}>
            {loading ? 'Loading…'
              : `${total.toLocaleString()} of ${totalPeople.toLocaleString()} people`}
          </span>
        </div>

        {loading ? (
          <div className="spinner-wrap"><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><p>No people match the current filters.</p></div>
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th>Person</th>
                    <th>Stage</th>
                    <th style={{ textAlign: 'right' }}>Interactions</th>
                    <th style={{ textAlign: 'right' }}>Behaviours</th>
                    <th>First seen</th>
                    <th>Last seen</th>
                    <th style={{ textAlign: 'right', minWidth: 150 }}>Intent</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(p => {
                    const open = expanded === p.email
                    return [
                      <tr
                        key={p.email}
                        onClick={() => toggle(p.email)}
                        style={{ cursor: 'pointer', background: open ? 'var(--bg-soft)' : undefined }}
                      >
                        <td style={{ color: 'var(--fg-3)', fontSize: 11 }}>{open ? '▼' : '▶'}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.full_name || '—'}</div>
                          <div style={{
                            color: 'var(--fg-3)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                          }}>
                            {p.email}
                          </div>
                        </td>
                        <td>
                          <StageBadge stage={p.effective_stage} />
                          {p.furthest_stage !== p.latest_stage && !p.is_churned && (
                            <div
                              style={{ fontSize: 10, color: 'var(--fg-4)', marginTop: 3 }}
                              title={`Scored on furthest stage reached. Most recent event was ${p.latest_stage}.`}
                            >
                              furthest · latest {p.latest_stage}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.interaction_count}</td>
                        <td style={{ textAlign: 'right', color: 'var(--fg-3)' }}>{p.distinct_tags}</td>
                        <td style={{ color: 'var(--fg-3)', fontSize: 12 }}>{fmtDate(p.first_seen)}</td>
                        <td style={{ color: 'var(--fg-3)', fontSize: 12 }}>
                          {fmtDate(p.last_seen)}
                          {p.is_decayed && (
                            <div
                              style={{ fontSize: 10, color: '#dc2626', marginTop: 3, fontWeight: 700 }}
                              title={`Inactive ${p.months_inactive} months — intent decayed by ${p.decay_penalty} from ${p.intent_before_decay}`}
                            >
                              🥶 {p.months_inactive} mo · {p.decay_penalty}
                            </div>
                          )}
                        </td>
                        <td><IntentPill score={p.intent_score} /></td>
                      </tr>,
                      open && (
                        <tr key={`${p.email}-tl`}>
                          <td colSpan={8} style={{ padding: 0 }}>
                            <Timeline
                              email={p.email}
                              data={cache[p.email]}
                              loading={tlLoading[p.email]}
                            />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="table-pagination">
                <span>Page {page + 1} of {totalPages}</span>
                <div className="pagination-btns">
                  <button className="pagination-btn" disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}>← Prev</button>
                  <button className="pagination-btn" disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
