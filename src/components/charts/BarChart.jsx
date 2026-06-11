import {
  BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { STAGES } from '../../constants/stages'

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'white', border: '1px solid var(--jh-line)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-2)',
    }}>
      <p style={{ fontWeight: 700, fontFamily: 'var(--font-display)', marginBottom: 4 }}>
        {payload[0].payload.emoji} {payload[0].payload.name}
      </p>
      <p style={{ color: payload[0].fill, fontWeight: 600 }}>
        {payload[0].value?.toLocaleString()} leads
      </p>
      <p style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
        {payload[0].payload.question}
      </p>
    </div>
  )
}

export default function BarChart({ metrics }) {
  if (!metrics) return <div className="empty-state"><p>No data yet</p></div>

  const data = STAGES.map(s => ({
    name:     s.label,
    emoji:    s.emoji,
    question: s.question,
    count:    metrics[s.key] ?? 0,
    color:    s.color,
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ReBarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--jh-line)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: 'var(--fg-3)' }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--fg-3)' }}
          axisLine={false} tickLine={false} width={50}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-soft)' }} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={72}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </ReBarChart>
    </ResponsiveContainer>
  )
}
