import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

/**
 * CRUD for user-defined funnels (custom_dashboards table).
 *
 * A dashboard:
 *   { id, name, description, stages: [{ key, label, emoji, color, tags: [] }] }
 */
export function useCustomDashboards() {
  const [dashboards, setDashboards] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('custom_dashboards')
      .select('*')
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setDashboards(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const createDashboard = useCallback(async (dashboard) => {
    const { data, error: err } = await supabase
      .from('custom_dashboards')
      .insert({
        name:        dashboard.name,
        description: dashboard.description ?? null,
        stages:      dashboard.stages ?? [],
      })
      .select()
      .single()
    if (err) throw new Error(err.message)
    await refresh()
    return data
  }, [refresh])

  const updateDashboard = useCallback(async (id, dashboard) => {
    const { error: err } = await supabase
      .from('custom_dashboards')
      .update({
        name:        dashboard.name,
        description: dashboard.description ?? null,
        stages:      dashboard.stages ?? [],
        updated_at:  new Date().toISOString(),
      })
      .eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  const deleteDashboard = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('custom_dashboards')
      .delete()
      .eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  return { dashboards, loading, error, refresh, createDashboard, updateDashboard, deleteDashboard }
}

/**
 * Compute lead counts for each custom stage from the aarrr_tag_breakdown
 * raw rows ([{ stage, tag, count }]). A custom stage's count is the sum
 * of counts of every tag assigned to it (each lead carries one tag).
 */
export function computeStageCounts(stages, tagRows) {
  const totals = {}
  for (const row of tagRows ?? []) {
    totals[row.tag] = (totals[row.tag] ?? 0) + row.count
  }
  return (stages ?? []).map(st => ({
    ...st,
    count: (st.tags ?? []).reduce((sum, t) => sum + (totals[t] ?? 0), 0),
  }))
}
