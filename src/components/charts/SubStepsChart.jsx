/**
 * SubStepsChart — visualises tag sub-steps within each AAARRR stage
 *
 * Two modes:
 *   "accordion" — one collapsible panel per stage, horizontal bar chart of tags
 *   "heatmap"   — stage × top-tag matrix with count cells
 */
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { STAGES } from '../../constants/stages'

// ---- Sub-mode toggle -----------------------------------------
const MODES = [
  { key: 'accordion', label: '≡ Per Stage' },
  { key: 'overview',  label: '⊞ Overview'  },
]

// ---- Accordion view: one stage at a time with horizontal bars ----
function StageAccordion({ stageData }) {
  const [open, setOpen] = useState(STAGES[0].key)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {STAGES.map(stage => {
        const tags    = stageData?.[stage.key] ?? []
        const total   = tags.reduce((s, t) => s + t.count, 0)
        const isOpen  = open === stage.key
        const top10   = tags.slice(0, 10)

        return (
          <div key={stage.key} style={{
            border: `1.5px solid ${isOpen ? stage.color : 'var(--jh-line)'}`,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            transition: 'border-color 200ms',
          }}>
            {/* Header */}
            <button
              onClick={() => setOpen(isOpen ? null : stage.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                gap: 12, padding: '12px 16px',
                background: isOpen ? `${stage.color}12` : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background 200ms',
              }}
            >
              <span style={{ fontSize: 20 }}>{stage.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
                               color: isOpen ? stage.color : 'var(--fg-1)' }}>
                  {stage.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
                  {stage.question}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
                               color: stage.color }}>
                  {total}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{tags.length} tags</div>
              </div>
              <span style={{ color: 'var(--fg-3)', fontSize: 16, flexShrink: 0 }}>
                {isOpen ? '▲' : '▼'}
              </span>
            </button>

            {/* Tag bars */}
            {isOpen && (
              <div style={{ padding: '8px 16px 16px' }}>
                {top10.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--fg-4)', padding: '8px 0' }}>
                    No tags recorded for this stage yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(160, top10.length * 32)}>
                    <BarChart
                      data={top10}
                      layout="vertical"
                      margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--fg-3)' }}
                             axisLine={false} tickLine={false} />
                      <YAxis
                        type="category" dataKey="tag" width={140}
                        tick={{ fontSize: 12, fill: 'var(--fg-2)', fontWeight: 500 }}
                        axisLine={false} tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'var(--bg-soft)' }}
                        formatter={(value) => [
                          `${value} leads (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
                          stage.label,
                        ]}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                        {top10.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={stage.color}
                            fillOpacity={1 - idx * 0.06}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---- Overview: stage × tag grid with top N tags across all stages ----
function TagOverview({ stageData }) {
  // Collect all unique tags across all stages, sorted by total count
  const tagTotals = {}
  STAGES.forEach(st => {
    (stageData?.[st.key] ?? []).forEach(({ tag, count }) => {
      tagTotals[tag] = (tagTotals[tag] ?? 0) + count
    })
  })
  const topTags = Object.entries(tagTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag]) => tag)

  if (!topTags.length) return <div className="empty-state"><p>No tags recorded yet.</p></div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11,
                         textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--fg-3)',
                         borderBottom: '2px solid var(--jh-line)', minWidth: 130 }}>
              Sub-step Tag
            </th>
            {STAGES.map(st => (
              <th key={st.key} style={{
                padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                color: st.color, borderBottom: '2px solid var(--jh-line)', minWidth: 90,
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
          {topTags.map((tag, i) => (
            <tr key={tag} style={{ background: i % 2 === 0 ? 'var(--bg-soft)' : 'white' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--fg-1)',
                            borderBottom: '1px solid var(--jh-line)' }}>
                {tag}
              </td>
              {STAGES.map(st => {
                const found = stageData?.[st.key]?.find(t => t.tag === tag)
                const count = found?.count ?? 0
                return (
                  <td key={st.key} style={{
                    padding: '10px 12px', textAlign: 'center',
                    borderBottom: '1px solid var(--jh-line)',
                  }}>
                    {count > 0 ? (
                      <span style={{ fontWeight: 700, color: st.color }}>{count}</span>
                    ) : (
                      <span style={{ color: 'var(--fg-4)' }}>—</span>
                    )}
                  </td>
                )
              })}
              <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700,
                            color: 'var(--fg-1)', borderBottom: '1px solid var(--jh-line)' }}>
                {tagTotals[tag]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 8, paddingLeft: 4 }}>
        Showing top 12 tags by total count. Tags come from the <code>tag</code> column on each lead.
      </p>
    </div>
  )
}

// ---- Main export ----
export default function SubStepsChart({ data, loading }) {
  const [mode, setMode] = useState('accordion')

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>

  const stageData = data?.byStage ?? {}

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        {MODES.map(m => (
          <button
            key={m.key}
            className={`chart-toggle-btn${mode === m.key ? ' active' : ''}`}
            style={{ fontSize: 12 }}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'accordion' && <StageAccordion stageData={stageData} />}
      {mode === 'overview'  && <TagOverview  stageData={stageData} />}
    </div>
  )
}
