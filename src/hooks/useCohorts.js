import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

/**
 * CRUD for cohorts — time-boxed target-vs-actual experiments.
 *
 * A cohort:
 *   { id, name, description, dashboard_id (null = AARRR),
 *     start_date, end_date (null = ongoing),
 *     targets: { stage_key: target_count } }
 */
export function useCohorts() {
  const [cohorts, setCohorts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('cohorts')
      .select('*')
      .order('start_date', { ascending: false })
    if (err) setError(err.message)
    else setCohorts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const createCohort = useCallback(async (cohort) => {
    const { data, error: err } = await supabase
      .from('cohorts')
      .insert({
        name:         cohort.name,
        description:  cohort.description ?? null,
        dashboard_id: cohort.dashboard_id ?? null,
        start_date:   cohort.start_date,
        end_date:     cohort.end_date || null,
        targets:      cohort.targets ?? {},
      })
      .select()
      .single()
    if (err) throw new Error(err.message)
    await refresh()
    return data
  }, [refresh])

  const updateCohort = useCallback(async (id, cohort) => {
    const { error: err } = await supabase
      .from('cohorts')
      .update({
        name:         cohort.name,
        description:  cohort.description ?? null,
        dashboard_id: cohort.dashboard_id ?? null,
        start_date:   cohort.start_date,
        end_date:     cohort.end_date || null,
        targets:      cohort.targets ?? {},
        updated_at:   new Date().toISOString(),
      })
      .eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  const deleteCohort = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('cohorts')
      .delete()
      .eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  return { cohorts, loading, error, refresh, createCohort, updateCohort, deleteCohort }
}

/** Cohort lifecycle status from its date window */
export function cohortStatus(cohort, today = new Date()) {
  const t = today.toISOString().slice(0, 10)
  if (cohort.start_date > t) return 'upcoming'
  if (cohort.end_date && cohort.end_date < t) return 'ended'
  return 'active'
}
