/**
 * Table view for custom funnels — one row per stage with the raw count
 * (each lead is counted once, in its current stage), share of top,
 * conversion from previous stage, and the tags mapped to the stage.
 *
 * stages: [{ key, label, emoji, color, count, tags }]
 */
export default function CustomTableView({ stages }) {
  if (!stages?.length) return <div className="empty-state"><p>No stages defined yet</p></div>

  const top = Math.max(1, stages[0]?.count ?? 0)

  const th = {
    padding: '10px 12px', fontWeight: 700, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--fg-3)',
    borderBottom: '2px solid var(--jh-line)', textAlign: 'right',
  }
  const td = {
    padding: '12px', borderBottom: '1px solid var(--jh-line)',
    textAlign: 'right', fontSize: 13,
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Stage</th>
            <th style={th}>Leads</th>
            <th style={th}>% of top</th>
            <th style={th}>Conv. from prev</th>
            <th style={{ ...th, textAlign: 'left' }}>Tags mapped</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s, i) => {
            const count    = s.count ?? 0
            const prev     = i === 0 ? null : (stages[i - 1].count ?? 0)
            const convPct  = prev === null ? null : prev > 0 ? (count / prev) * 100 : 0
            const sharePct = (count / top) * 100
            const convColor = convPct === null
              ? 'var(--fg-3)'
              : convPct < 20 ? '#dc2626' : convPct < 50 ? '#f08a1c' : '#22c55e'

            return (
              <tr key={s.key ?? i} style={{ background: i % 2 === 0 ? 'var(--bg-soft)' : 'white' }}>
                <td style={{ ...td, textAlign: 'left' }}>
                  <span style={{ fontSize: 16, marginRight: 6 }}>{s.emoji}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: s.color }}>
                    {s.label}
                  </span>
                </td>
                <td style={{ ...td, fontWeight: 700 }}>{count.toLocaleString()}</td>
                <td style={td}>{sharePct.toFixed(1)}%</td>
                <td style={{ ...td, fontWeight: 700, color: convColor }}>
                  {convPct === null ? '—' : `${convPct.toFixed(1)}%`}
                </td>
                <td style={{ ...td, textAlign: 'left' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 360 }}>
                    {(s.tags ?? []).length === 0
                      ? <span style={{ color: 'var(--fg-4)', fontSize: 12 }}>—</span>
                      : s.tags.map(t => (
                          <span key={t} title={t} style={{
                            fontSize: 11, padding: '2px 8px',
                            borderRadius: 'var(--radius-pill)',
                            background: `${s.color}14`, border: `1px solid ${s.color}35`,
                            color: 'var(--fg-2)', maxWidth: 220,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {t}
                          </span>
                        ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 8, paddingLeft: 4 }}>
        <strong>Leads</strong> = leads whose tag sits in this stage today (each lead counted once)
      </p>
    </div>
  )
}
