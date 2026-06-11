import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const PAGE_SIZE = 50

/**
 * Calls get_leads_list RPC (authenticated only).
 * Returns paginated rows + total count.
 */
export function useLeadsData({ stage, source, startDate, endDate } = {}) {
  const [rows, setRows]       = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setPage(0)  // reset to first page when filters change
  }, [stage, source, startDate, endDate])

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      setLoading(true)
      setError(null)

      const { data, error: rpcError } = await supabase
        .rpc('get_leads_list', {
          p_stage:  stage      || null,
          p_source: source     || null,
          p_start:  startDate  || null,
          p_end:    endDate    || null,
          p_limit:  PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        })

      if (cancelled) return
      if (rpcError) { setError(rpcError.message); setLoading(false); return }

      setRows(data?.rows ?? [])
      setTotal(data?.total ?? 0)
      setLoading(false)
    }

    fetch()
    return () => { cancelled = true }
  }, [stage, source, startDate, endDate, page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return { rows, total, page, totalPages, setPage, loading, error }
}
