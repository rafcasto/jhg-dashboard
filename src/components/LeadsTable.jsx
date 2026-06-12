import { useState } from 'react'

const STAGE_COLORS = {
  awareness:   '#7a1ec2',
  acquisition: '#0033cc',
  activation:  '#6bbf6b',
  retention:   '#f5d000',
  referral:    '#f08a1c',
  revenue:     '#2f7a3a',
}

const COLUMNS = [
  { key: 'full_name',  label: 'Name',     sortable: true  },
  { key: 'email',      label: 'Email',    sortable: true  },
  { key: 'stage',      label: 'Stage',    sortable: true  },
  { key: 'source',     label: 'Source',   sortable: true  },
  { key: 'score',      label: 'Score',    sortable: true  },
  { key: 'archetype',  label: 'Archetype',sortable: false },
  { key: 'created_at', label: 'Added',    sortable: true  },
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

export default function LeadsTable({ rows, total, page, totalPages, setPage, loading }) {
  const [sortKey, setSortKey]   = useState('created_at')
  const [sortDir, setSortDir]   = useState('desc')

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const withNames = (rows ?? []).map(r => ({ ...r, full_name: fullName(r) }))

  const sorted = [...withNames].sort((a, b) => {
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
        <span className="table-count">
          {loading ? 'Loading…' : `${start}–${end} of ${total?.toLocaleString()} leads`}
        </span>
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
                {sorted.map(lead => (
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
                        style={{ background: STAGE_COLORS[lead.stage] ?? 'var(--fg-3)' }}
                      >
                        {lead.stage}
                      </span>
                    </td>
                    <td style={{ color: 'var(--fg-3)' }}>{lead.source ?? '—'}</td>
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
                ))}
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
