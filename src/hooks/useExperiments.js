import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

/**
 * CRUD for experiments — time-boxed posting windows measured against
 * downstream funnels.
 *
 *   { id, name, description, hypothesis,
 *     dashboard_id (null = AARRR), start_date, end_date (null = ongoing),
 *     targets: { stage_key: target_count },
 *     channels: [integration_id],          LinkedIn accounts posting
 *     downstream_sites: [site_key],        GA4 sites to measure
 *     baseline_days: int | null }
 */
export function useExperiments() {
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('experiments')
      .select('*')
      .order('start_date', { ascending: false })
    if (err) setError(err.message)
    else setExperiments(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const toRow = exp => ({
    name:             exp.name,
    description:      exp.description ?? null,
    hypothesis:       exp.hypothesis ?? null,
    dashboard_id:     exp.dashboard_id ?? null,
    start_date:       exp.start_date,
    end_date:         exp.end_date || null,
    targets:          exp.targets ?? {},
    channels:         exp.channels ?? [],
    downstream_sites: exp.downstream_sites ?? [],
    baseline_days:    exp.baseline_days || null,
  })

  const createExperiment = useCallback(async (exp) => {
    const { data, error: err } = await supabase
      .from('experiments').insert(toRow(exp)).select().single()
    if (err) throw new Error(err.message)
    await refresh()
    return data
  }, [refresh])

  const updateExperiment = useCallback(async (id, exp) => {
    const { error: err } = await supabase
      .from('experiments')
      .update({ ...toRow(exp), updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  const deleteExperiment = useCallback(async (id) => {
    const { error: err } = await supabase.from('experiments').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  return { experiments, loading, error, refresh, createExperiment, updateExperiment, deleteExperiment }
}

/** Lifecycle status from the posting window */
export function experimentStatus(exp, today = new Date()) {
  const t = today.toISOString().slice(0, 10)
  if (exp.start_date > t) return 'upcoming'
  if (exp.end_date && exp.end_date < t) return 'ended'
  return 'active'
}
