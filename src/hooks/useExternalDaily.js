import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { LINKEDIN_METRICS, GA4_METRICS } from '../constants/stageSources'
import { sumRows } from '../lib/stageCounts'

const LI_FIELDS = LINKEDIN_METRICS.map(m => m.key)
const GA_FIELDS = GA4_METRICS.map(m => m.key)

/**
 * LinkedIn + GA4 daily metrics summed over a date range across ALL
 * connected accounts / sites — for screens that have no experiment to
 * scope them (Custom Dashboards page, Overall targets tab).
 *
 * Empty startDate/endDate = all time. Nothing is fetched unless the
 * matching `need` flag is on.
 *
 * Returns { linkedin: { hasData, totals }, ga4: { [site]: { hasData, totals } }, loading }
 */
export function useExternalDaily({ startDate, endDate, need = { linkedin: false, ga4: false } }) {
  const [raw, setRaw]         = useState({ li: [], ga: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!need.linkedin && !need.ga4) { setRaw({ li: [], ga: [] }); return }
    let cancelled = false
    async function load() {
      setLoading(true)
      const range = q => {
        if (startDate) q = q.gte('date', startDate)
        if (endDate)   q = q.lte('date', endDate)
        return q
      }
      const [li, ga] = await Promise.all([
        need.linkedin
          ? range(supabase.from('awareness_daily').select(`date,${LI_FIELDS.join(',')}`))
          : Promise.resolve({ data: [] }),
        need.ga4
          ? range(supabase.from('site_daily').select(`site_key,date,${GA_FIELDS.join(',')}`))
          : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      setRaw({ li: li.data ?? [], ga: ga.data ?? [] })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [startDate, endDate, need.linkedin, need.ga4])

  const data = useMemo(() => {
    const linkedin = { hasData: raw.li.length > 0, totals: sumRows(raw.li, LI_FIELDS) }
    const bySite = {}
    for (const r of raw.ga) (bySite[r.site_key] ??= []).push(r)
    const ga4 = Object.fromEntries(Object.entries(bySite).map(([k, rows]) =>
      [k, { hasData: rows.length > 0, totals: sumRows(rows, GA_FIELDS) }]))
    return { linkedin, ga4 }
  }, [raw])

  return { ...data, loading }
}
