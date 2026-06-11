import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { STAGES } from '../../constants/stages'

function formatWeek(iso) {
  const d = new Date(iso)
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'white', border: '1px solid var(--jh-line)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-2)', minWidth: 160,
    }}>
      <p style={{ fontWeight: 700, marginBottom: 6, fontFamily: 'var(--font-display)', fontSize: 13 }}>
        Week of {formatWeek(label)}
      </p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.stroke, fontSize: 13, marginBottom: 2 }}>
          {STAGES.find(s => s.key === p.dataKey)?.emoji} {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

export default function TrendChart({ data }) {
  if (!data?.length) return <div className="empty-state"><p>No trend data in this date range</p></div>

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--jh-line)" vertical={false} />
        <XAxis
          dataKey="week" tickFormatter={formatWeek}
          tick={{ fontSize: 11, fill: 'var(--fg-3)' }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--fg-3)' }}
          axisLine={false} tickLine={false} width={40}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => {
            const s = STAGES.find(st => st.key === value)
            return s ? `${s.emoji} ${s.label}` : value
          }}
          wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
        />
        {STAGES.map(s => (
          <Line
            key={s.key} type="monotone" dataKey={s.key} name={s.key}
            stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
