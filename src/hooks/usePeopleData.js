import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

const PAGE_SIZE = 50

/**
 * Unique leads — one row per email, from the lead_people view.
 *
 * jobhackers_leads is an event log (~1,706 rows ≈ 1,536 people), so this
 * is the person grain: furthest stage reached, distinct tag behaviours,
 * and a single intent score per human.
 */
export function usePeopleList({ search, stage, source, startDate, endDate, minIntent, sort, fitBand, intentBand } = {}) {
  const [rows, setRows]           = useState([])
  const [total, setTotal]         = useState(0)
  const [totalPeople, setTotalPeople] = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  useEffect(() => {
    setPage(0)
  }, [search, stage, source, startDate, endDate, minIntent, sort, fitBand, intentBand])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase.rpc('get_people_list', {
        p_search:     search    || null,
        p_stage:      stage     || null,
        p_source:     source    || null,
        p_start:      startDate || null,
        p_end:        endDate   || null,
        p_min_intent: (minIntent === '' || minIntent == null) ? null : Number(minIntent),
        p_sort:       sort      || 'intent',
        p_fit_band:    fitBand    || null,
        p_intent_band: intentBand || null,
        p_limit:      PAGE_SIZE,
        p_offset:     page * PAGE_SIZE,
      })
      if (cancelled) return
      if (err) { setError(err.message); setLoading(false); return }
      setRows(data?.rows ?? [])
      setTotal(data?.total ?? 0)
      setTotalPeople(data?.total_people ?? 0)
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [search, stage, source, startDate, endDate, minIntent, sort, fitBand, intentBand, page])

  return {
    rows, total, totalPeople, page, setPage,
    totalPages: Math.ceil(total / PAGE_SIZE),
    loading, error,
  }
}

/**
 * One person's full interaction history.
 * Each entry carries points_contributed — 0 for repeats, since distinct
 * scoring only counts the first occurrence of each tag.
 */
export function usePersonTimeline() {
  const [cache, setCache]     = useState({})
  const [loading, setLoading] = useState({})

  const load = useCallback(async (email) => {
    if (cache[email] || loading[email]) return
    setLoading(l => ({ ...l, [email]: true }))
    const { data, error } = await supabase.rpc('get_person_timeline', { p_email: email })
    setCache(c => ({ ...c, [email]: error ? { error: error.message } : data }))
    setLoading(l => ({ ...l, [email]: false }))
  }, [cache, loading])

  return { cache, loading, load }
}

/**
 * Intent × fit quadrant summary — counts per segment plus the
 * unknown-fit bucket (people who never took the quiz).
 * From public.people_quadrant() (migration 017).
 */
export function usePeopleQuadrant({ startDate, endDate } = {}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      const { data: d, error: err } = await supabase.rpc('people_quadrant', {
        p_start: startDate || null,
        p_end:   endDate   || null,
      })
      if (cancelled) return
      if (err) { setError(err.message); setLoading(false); return }
      setData(d)
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [startDate, endDate])

  return { data, loading, error }
}
