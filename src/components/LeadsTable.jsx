import { useState } from 'react'
import { STAGE_MAP } from '../constants/stages'
import { intentBand, intentBarPct } from '../constants/intent'
import ExportButton from './ExportButton'

const COLUMNS = [
  { key: 'full_name',    label: 'Name',       sortable: true  },
  { key: 'email',        label: 'Email',      sortable: true  },
  { key: 'stage',        label: 'Stage',      sortable: true  },
  { key: 'tag',          label: 'Tag',        sortable: false },
  { key: 'source',       label: 'Source',     sortable: true  },
  { key: 'location',     label: 'Location',   sortable: true  },
  { key: 'intent_score', label: 'Intent',     sortable: true  },
  { key: 'score',        label: 'Quiz score', sortable: true  },
  { key: 'archetype',    label: 'Archetype',  sortable: false },
  { key: 'created_at',   label: 'Added',      sortable: true  },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: '2-digit' })
}

/** Concatenate first + last name, tolerating nulls/blanks on either side */
export function fullName(lead) {
  return [lead.first_name, lead.last_name]
    .filter(v => v && String(v).trim())
    .join(' ')
}

/** Buying-intent cell: coloured bar + signed score + band label */
function IntentCell({ score }) {
  const value = Number(score ?? 0)
  const band  = intentBand(value)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
      <div style={{
        flex: 1, height: 6, borderRadius: 999,
        background: 'var(--bg-soft)', overflow: 'hidden', minWidth: 50,
      }}>
        <div style={{
          width: `${intentBarPct(value)}%`, height: '100%',
          background: band.color, borderRadius: 999,
        }} />
      </div>
      <span
        title={`${band.label} — ${band.description}`}
        style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
          color: band.color, minWidth: 32, textAlign: 'right',
        }}
      >
        {value > 0 ? `+${value}` : value}
      </span>
      <span style={{ fontSize: 13 }} title={band.label}>{band.emoji}</span>
    </div>
  )
}

export default function LeadsTable({ rows, total, page, totalPages, setPage, loading, exportParams, exportName = 'leads' }) {
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const withNames = (rows ?? []).map(r => ({ ...r, full_name: fullName(r) }))

  const sorted = [...withNames].sort((a, b) => {
    // numeric columns must compare as numbers, not strings, or -50 sorts above 9
    if (sortKey === 'intent_score' || sortKey === 'score') {
      const cmp = Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0)
      return sortDir === 'asc' ? cmp : -cmp
    }
    const aVal = a[sortKey] ?? ''
    const bVal = b[sortKey] ?? ''
    const cmp  = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const start = page * 50 + 1
  const end   = Math.min(page * 50 + (rows?.length ?? 0), total)

  return (
    <div className="table-section">
      <div className="table-header">
        <span className="table-title">📋 Leads</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          <span className="table-count">
            {loading ? 'Loading…' : `${start}–${end} of ${total?.toLocaleString()} leads`}
          </span>
          {exportParams && (
            <ExportButton
              label="⬇ Export CSV"
              filename={exportName}
              title="Download every lead matching the current filters (unique by email)"
              params={exportParams}
            />
          )}
        </div>
      </div>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : sorted.length === 0 ? (
        <div className="empty-state"><p>No leads match the current filters.</p></div>
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      className={sortKey === col.key ? 'sorted' : ''}
                      onClick={() => col.sortable && toggleSort(col.key)}
                      style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                    >
                      {col.label}
                      {sortKey === col.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(lead => {
                  const stageInfo = STAGE_MAP[lead.stage]
                  return (
                    <tr key={lead.id}>
                      <td style={{ fontWeight: 600 }}>
                        {lead.full_name || '—'}
                      </td>
                      <td style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                        {lead.email}
                      </td>
                      <td>
                        <span
                          className="stage-badge"
                          style={{ background: stageInfo?.color ?? 'var(--fg-3)' }}
                        >
                          {stageInfo?.emoji} {lead.stage}
                        </span>
                      </td>
                      <td style={{ color: 'var(--fg-3)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.tag ?? '—'}
                      </td>
                      <td style={{ color: 'var(--fg-3)' }}>{lead.source ?? '—'}</td>
                      <td style={{ color: 'var(--fg-3)', fontSize: 12 }}>{lead.location ?? '—'}</td>
                      <td>
                        <IntentCell score={lead.intent_score} />
                      </td>
                      <td>
                        <div className="score-bar-wrap">
                          <div className="score-bar">
                            <div className="score-fill" style={{ width: `${lead.score ?? 0}%` }} />
                          </div>
                          <span className="score-num">{lead.score ?? 0}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--fg-3)', fontSize: 12 }}>{lead.archetype ?? '—'}</td>
                      <td style={{ color: 'var(--fg-3)', fontSize: 12 }}>{formatDate(lead.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="table-pagination">
              <span>Page {page + 1} of {totalPages}</span>
              <div className="pagination-btns">
                <button
                  className="pagination-btn"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >← Prev</button>
                <button
                  className="pagination-btn"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
