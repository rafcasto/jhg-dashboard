import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { STAGE_KEYS } from '../constants/stages'

/**
 * Calls aarrr_source_breakdown and reshapes for the matrix chart.
 */
export function useSourceBreakdown({ startDate, endDate } = {}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      setLoading(true)
      setError(null)

      const { data: rows, error: rpcError } = await supabase
        .rpc('aarrr_source_breakdown', {
          p_start: startDate || null,
          p_end:   endDate   || null,
        })

      if (cancelled) return
      if (rpcError) { setError(rpcError.message); setLoading(false); return }

      const list    = rows ?? []
      const sources = [...new Set(list.map(r => r.source))].sort()

      const matrix = {}
      sources.forEach(src => {
        matrix[src] = {}
        STAGE_KEYS.forEach(st => { matrix[src][st] = 0 })
      })
      list.forEach(r => {
        if (matrix[r.source]) matrix[r.source][r.stage] = r.count
      })

      setData({ sources, stages: STAGE_KEYS, matrix, raw: list })
      setLoading(false)
    }

    fetch()
    return () => { cancelled = true }
  }, [startDate, endDate])

  return { data, loading, error }
}
