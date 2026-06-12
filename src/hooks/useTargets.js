import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

/**
 * Targets per funnel stage (funnel_targets table).
 * dashboard_id = null → main AARRR funnel, otherwise a custom dashboard.
 *
 * Returns targets as { [scopeKey]: { [stage_key]: { id, target_count } } }
 * where scopeKey is 'aarrr' or the dashboard uuid.
 */
export function useTargets() {
  const [targets, setTargets] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('funnel_targets')
      .select('*')
    if (err) { setError(err.message); setLoading(false); return }

    const map = {}
    for (const row of data ?? []) {
      const scope = row.dashboard_id ?? 'aarrr'
      if (!map[scope]) map[scope] = {}
      map[scope][row.stage_key] = { id: row.id, target_count: row.target_count }
    }
    setTargets(map)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  /**
   * Save a batch of targets for one scope.
   * entries: [{ stage_key, target_count }]
   */
  const saveTargets = useCallback(async (scopeKey, entries) => {
    const dashboardId = scopeKey === 'aarrr' ? null : scopeKey
    const existing    = targets[scopeKey] ?? {}

    for (const entry of entries) {
      const current = existing[entry.stage_key]
      if (current) {
        const { error: err } = await supabase
          .from('funnel_targets')
          .update({ target_count: entry.target_count, updated_at: new Date().toISOString() })
          .eq('id', current.id)
        if (err) throw new Error(err.message)
      } else {
        const { error: err } = await supabase
          .from('funnel_targets')
          .insert({
            dashboard_id: dashboardId,
            stage_key:    entry.stage_key,
            target_count: entry.target_count,
          })
        if (err) throw new Error(err.message)
      }
    }
    await refresh()
  }, [targets, refresh])

  return { targets, loading, error, refresh, saveTargets }
}
