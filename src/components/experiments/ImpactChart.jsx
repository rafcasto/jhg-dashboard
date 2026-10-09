import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceArea, ResponsiveContainer,
} from 'recharts'
import { fmtNum, pctChange } from '../../lib/experimentWindow'

/**
 * Small-multiple impact chart: one panel per measure, all sharing the same
 * x-axis (baseline window → posting window). Never a dual axis — each
 * measure keeps its own scale in its own panel.
 *
 * panels: [{ key, title, color, data: [{ date, value }], before, after, empty, note }]
 */
function fmtDay(iso) {
  const d = new Date(`${iso}T00:00:00`)
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
}

function phaseOf(date, win) {
  if (date >= win.postStart && date <= win.postEnd) return 'Posting window'
  if (date >= win.baseStart && date <= win.baseEnd) return 'Baseline'
  return ''
}

function PanelTooltip({ active, payload, label, title, win }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '1px solid var(--jh-line)', borderRadius: 8,
                  padding: '8px 12px', boxShadow: 'var(--shadow-2)', fontSize: 12 }}>
      <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>{fmtDay(label)}</div>
      <div style={{ color: 'var(--fg-3)', marginBottom: 4 }}>{phaseOf(label, win)}</div>
      <div>{title}: <strong>{fmtNum(payload[0].value)}</strong></div>
    </div>
  )
}

function Delta({ before, after }) {
  const pct = pctChange(before, after)
  if (pct === null) return <span style={{ color: 'var(--fg-4)', fontSize: 12 }}>no baseline</span>
  const up = pct > 0.5, down = pct < -0.5
  const color = up ? '#166534' : down ? '#b91c1c' : 'var(--fg-3)'
  const icon  = up ? '▲' : down ? '▼' : '■'
  return (
    <span style={{ color, fontSize: 12, fontWeight: 700 }}>
      {icon} {Math.abs(pct).toFixed(0)}% vs baseline
    </span>
  )
}

export default function ImpactChart({ window: win, panels }) {
  const visible = panels.filter(Boolean)
  if (!visible.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {visible.map((p, i) => {
        const isLast = i === visible.length - 1
        return (
          <div key={p.key} style={{ borderTop: i ? '1px solid var(--jh-line)' : 'none', paddingTop: i ? 8 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '0 4px 2px' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                             background: p.color, alignSelf: 'center' }} />
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
                {p.title}
              </span>
              <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>
                {fmtNum(p.after)} in window
              </span>
              <Delta before={p.before} after={p.after} />
              {p.note && <span style={{ fontSize: 12, color: '#b45309' }}>· {p.note}</span>}
              {p.empty && !p.note && (
                <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>· no data yet — sync in Settings</span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={isLast ? 150 : 120}>
              <AreaChart data={p.data} margin={{ top: 6, right: 12, left: 0, bottom: isLast ? 4 : 0 }}
                         syncId="experiment-impact">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--jh-line)" vertical={false} />
                <ReferenceArea x1={win.baseStart} x2={win.baseEnd} fill="var(--fg-4)" fillOpacity={0.08}
                               ifOverflow="visible" />
                <ReferenceArea x1={win.postStart} x2={win.postEnd} fill={p.color} fillOpacity={0.08}
                               ifOverflow="visible" />
                <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={28}
                       tick={isLast ? { fontSize: 11, fill: 'var(--fg-3)' } : false}
                       axisLine={false} tickLine={false} height={isLast ? 24 : 4} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--fg-3)' }} axisLine={false} tickLine={false}
                       width={44} allowDecimals={false} tickFormatter={v => v.toLocaleString()} />
                <Tooltip content={<PanelTooltip title={p.title} win={win} />} cursor={{ stroke: 'var(--fg-4)' }} />
                <Area type="monotone" dataKey="value" stroke={p.color} strokeWidth={2}
                      fill={p.color} fillOpacity={0.12} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'white' }}
                      isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--fg-3)', padding: '4px 4px 0' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--fg-4)', opacity: 0.3, marginRight: 4 }} />
          Baseline {fmtDay(win.baseStart)} – {fmtDay(win.baseEnd)} ({win.baseDays}d)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--jh-red)', opacity: 0.2, marginRight: 4 }} />
          Posting window {fmtDay(win.postStart)} – {fmtDay(win.postEnd)} ({win.postDays}d{win.ongoing ? ', ongoing' : ''})</span>
      </div>
    </div>
  )
}
