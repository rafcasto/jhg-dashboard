import { STAGES } from '../../constants/stages'

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function cellOpacity(count, max) {
  if (!count || !max) return 0
  return 0.12 + (count / max) * 0.7
}

export default function SourceMatrix({ data }) {
  if (!data?.sources?.length) return <div className="empty-state"><p>No source data yet</p></div>

  const { sources, matrix } = data
  let max = 0
  sources.forEach(src => {
    STAGES.forEach(st => { if (matrix[src]?.[st.key] > max) max = matrix[src][st.key] })
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11,
                         textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--fg-3)',
                         borderBottom: '2px solid var(--jh-line)' }}>
              Source
            </th>
            {STAGES.map(st => (
              <th key={st.key} style={{
                padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                color: st.color, borderBottom: '2px solid var(--jh-line)',
              }}>
                {st.emoji}<br />{st.label}
              </th>
            ))}
            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11,
                         textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--fg-3)',
                         borderBottom: '2px solid var(--jh-line)' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((src, i) => {
            const rowTotal = STAGES.reduce((sum, st) => sum + (matrix[src]?.[st.key] ?? 0), 0)
            return (
              <tr key={src} style={{ background: i % 2 === 0 ? 'var(--bg-soft)' : 'white' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--fg-2)',
                              borderBottom: '1px solid var(--jh-line)' }}>
                  {src}
                </td>
                {STAGES.map(st => {
                  const count   = matrix[src]?.[st.key] ?? 0
                  const opacity = cellOpacity(count, max)
                  return (
                    <td key={st.key} style={{
                      padding: '10px 12px', textAlign: 'center',
                      borderBottom: '1px solid var(--jh-line)',
                      background: count > 0
                        ? `rgba(${hexToRgb(st.color)},${opacity})`
                        : 'transparent',
                    }}>
                      {count > 0 ? (
                        <span style={{ fontWeight: 700, color: count > max * 0.6 ? 'white' : st.color }}>
                          {count}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--fg-4)' }}>—</span>
                      )}
                    </td>
                  )
                })}
                <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700,
                              color: 'var(--fg-1)', borderBottom: '1px solid var(--jh-line)' }}>
                  {rowTotal}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
