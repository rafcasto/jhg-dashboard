import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { LINKEDIN_METRICS, GA4_METRICS, KIT_METRICS, EMAIL_SCOPE_BROADCASTS } from '../constants/stageSources'
import { sumRows } from '../lib/stageCounts'

const LI_FIELDS = LINKEDIN_METRICS.map(m => m.key)
const GA_FIELDS = GA4_METRICS.map(m => m.key)
const EM_FIELDS = KIT_METRICS.map(m => m.key)

/**
 * LinkedIn + GA4 + Kit email daily metrics summed over a date range across
 * ALL connected accounts / sites — for screens that have no experiment to
 * scope them (Custom Dashboards page, Overall targets tab).
 *
 * Empty startDate/endDate = all time. Nothing is fetched unless the
 * matching `need` flag is on.
 *
 * Returns {
 *   linkedin: { hasData, totals },
 *   ga4:      { [site]: { hasData, totals } },
 *   kit:      { hasData, totals,                       ← all email (broadcasts + sequences)
 *               scopes: { broadcasts: { hasData, totals }, [sequence_id]: { hasData, totals } } },
 *   loading }
 */
export function useExternalDaily({ startDate, endDate, need = { linkedin: false, ga4: false, kit: false } }) {
  const [raw, setRaw]         = useState({ li: [], ga: [], em: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!need.linkedin && !need.ga4 && !need.kit) { setRaw({ li: [], ga: [], em: [] }); return }
    let cancelled = false
    async function load() {
      setLoading(true)
      const range = q => {
        if (startDate) q = q.gte('date', startDate)
        if (endDate)   q = q.lte('date', endDate)
        return q
      }
      const [li, ga, em] = await Promise.all([
        need.linkedin
          ? range(supabase.from('awareness_daily').select(`date,${LI_FIELDS.join(',')}`))
          : Promise.resolve({ data: [] }),
        need.ga4
          ? range(supabase.from('site_daily').select(`site_key,date,${GA_FIELDS.join(',')}`))
          : Promise.resolve({ data: [] }),
        need.kit
          ? range(supabase.from('email_daily').select(`date,channel,sequence_id,${EM_FIELDS.join(',')}`))
          : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      setRaw({ li: li.data ?? [], ga: ga.data ?? [], em: em.data ?? [] })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [startDate, endDate, need.linkedin, need.ga4, need.kit])

  const data = useMemo(() => {
    const linkedin = { hasData: raw.li.length > 0, totals: sumRows(raw.li, LI_FIELDS) }

    const byScope = {}
    for (const r of raw.em) {
      const k = r.channel === 'broadcast' ? EMAIL_SCOPE_BROADCASTS : r.sequence_id
      if (k) (byScope[k] ??= []).push(r)
    }
    const kit = {
      hasData: raw.em.length > 0,
      totals:  sumRows(raw.em, EM_FIELDS),
      scopes:  Object.fromEntries(Object.entries(byScope).map(([k, rows]) =>
        [k, { hasData: rows.length > 0, totals: sumRows(rows, EM_FIELDS) }])),
    }

    const bySite = {}
    for (const r of raw.ga) (bySite[r.site_key] ??= []).push(r)
    const ga4 = Object.fromEntries(Object.entries(bySite).map(([k, rows]) =>
      [k, { hasData: rows.length > 0, totals: sumRows(rows, GA_FIELDS) }]))
    return { linkedin, ga4, kit }
  }, [raw])

  return { ...data, loading }
}
