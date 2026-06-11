import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { STAGE_KEYS } from '../constants/stages'

/**
 * Calls aarrr_trend_by_week and reshapes into recharts-friendly format.
 * Returns: [{ week: '2025-03-10', awareness: 3, acquisition: 5, ... }, ...]
 */
export function useTrendData({ startDate, endDate } = {}) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      setLoading(true)
      setError(null)

      const defaultStart = new Date()
      defaultStart.setDate(defaultStart.getDate() - 90)

      const { data: rows, error: rpcError } = await supabase
        .rpc('aarrr_trend_by_week', {
          p_start: startDate || defaultStart.toISOString(),
          p_end:   endDate   || new Date().toISOString(),
        })

      if (cancelled) return
      if (rpcError) { setError(rpcError.message); setLoading(false); return }

      // Pivot: group by week, merge stages as keys
      const byWeek = {}
      for (const row of (rows ?? [])) {
        const w = row.week
        if (!byWeek[w]) byWeek[w] = { week: w }
        byWeek[w][row.stage] = row.count
      }

      // Fill zeros for missing stages
      const shaped = Object.values(byWeek).map(w => {
        const out = { week: w.week }
        STAGE_KEYS.forEach(s => { out[s] = w[s] ?? 0 })
        return out
      }).sort((a, b) => a.week > b.week ? 1 : -1)

      setData(shaped)
      setLoading(false)
    }

    fetch()
    return () => { cancelled = true }
  }, [startDate, endDate])

  return { data, loading, error }
}
