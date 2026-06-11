import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { STAGES } from '../../constants/stages'

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div style={{
      background: 'white', border: '1px solid var(--jh-line)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-2)',
    }}>
      <p style={{ fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 13 }}>{d.name}</p>
      <p style={{ fontSize: 13 }}>{d.value?.toLocaleString()} leads ({d.payload.pct}%)</p>
    </div>
  )
}

export default function DonutChart({ metrics }) {
  if (!metrics) return <div className="empty-state"><p>No data yet</p></div>

  const total = STAGES.reduce((sum, s) => sum + (metrics[s.key] ?? 0), 0)
  const data = STAGES
    .map(s => ({
      name:  `${s.emoji} ${s.label}`,
      value: metrics[s.key] ?? 0,
      color: s.color,
      pct:   total > 0 ? Math.round(((metrics[s.key] ?? 0) / total) * 100) : 0,
    }))
    .filter(d => d.value > 0)

  if (!data.length) return <div className="empty-state"><p>No data yet</p></div>

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%"
          innerRadius={80} outerRadius={130} paddingAngle={3} dataKey="value">
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
