import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

/**
 * Calls aarrr_tag_breakdown and returns data shaped for the SubSteps chart.
 *
 * Returns:
 *   byStage: {
 *     awareness:   [{ tag, count }, ...],
 *     acquisition: [...],
 *     ...
 *   }
 *   topTagsFlat: [{ stage, tag, count }, ...]  ← for overview bar chart
 */
export function useTagBreakdown({ startDate, endDate, stage } = {}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      setLoading(true)
      setError(null)

      const { data: rows, error: rpcError } = await supabase
        .rpc('aarrr_tag_breakdown', {
          p_start: startDate || null,
          p_end:   endDate   || null,
          p_stage: stage     || null,
        })

      if (cancelled) return
      if (rpcError) { setError(rpcError.message); setLoading(false); return }

      const list = rows ?? []

      // Group by stage
      const byStage = {}
      for (const row of list) {
        if (!byStage[row.stage]) byStage[row.stage] = []
        byStage[row.stage].push({ tag: row.tag, count: row.count })
      }

      // Sort each stage's tags by count desc (already done in SQL but just in case)
      Object.keys(byStage).forEach(s => {
        byStage[s].sort((a, b) => b.count - a.count)
      })

      setData({ byStage, raw: list })
      setLoading(false)
    }

    fetch()
    return () => { cancelled = true }
  }, [startDate, endDate, stage])

  return { data, loading, error }
}
