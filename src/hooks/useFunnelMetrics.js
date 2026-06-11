import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

/**
 * Calls the aarrr_funnel_metrics SECURITY DEFINER RPC.
 * Uses the anon key — no raw rows exposed to the browser.
 */
export function useFunnelMetrics({ startDate, endDate, source } = {}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      setLoading(true)
      setError(null)

      const { data: result, error: rpcError } = await supabase
        .rpc('aarrr_funnel_metrics', {
          p_start:  startDate || null,
          p_end:    endDate   || null,
          p_source: source    || null,
        })

      if (cancelled) return

      if (rpcError) { setError(rpcError.message); setLoading(false); return }

      setData(result)
      setLoading(false)
    }

    fetch()
    return () => { cancelled = true }
  }, [startDate, endDate, source])

  return { data, loading, error }
}
