import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { resolveStageCounts } from '../lib/stageCounts'

/**
 * CRUD for user-defined funnels (custom_dashboards table).
 *
 * A dashboard:
 *   { id, name, description, stages: [{ key, label, emoji, color, source, tags, metric, site }] }
 *   source: 'tags' (default) | 'linkedin' | 'ga4' — see constants/stageSources
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
 * Tag-only stage counts (legacy signature). Prefer resolveStageCounts
 * from lib/stageCounts when LinkedIn / GA4 data is available.
 */
export function computeStageCounts(stages, tagRows) {
  return resolveStageCounts(stages, { tagRows })
}
