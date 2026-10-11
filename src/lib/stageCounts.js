// ============================================================
// Resolve a custom dashboard's stages to numbers.
//
// resolveStageCounts(stages, {
//   tagRows:  [{ stage, tag, count }]                       aarrr_tag_breakdown rows
//   linkedin: { hasData, totals: { impressions, … } }       summed over the window
//   ga4:      { [siteKey]: { hasData, totals: { sessions, … } } }
// })
// → stages with `count` and `noData` (true when an external stage's
//   source had no rows at all for the window — a 0 that means "unknown").
// ============================================================

import { stageSource } from '../constants/stageSources.js'

export function resolveStageCounts(stages, { tagRows, linkedin, ga4 } = {}) {
  const tagTotals = {}
  for (const row of tagRows ?? []) tagTotals[row.tag] = (tagTotals[row.tag] ?? 0) + row.count

  return (stages ?? []).map(st => {
    const source = stageSource(st)

    if (source === 'tags') {
      return { ...st, count: (st.tags ?? []).reduce((sum, t) => sum + (tagTotals[t] ?? 0), 0), noData: false }
    }

    if (source === 'linkedin') {
      const n = Number(linkedin?.totals?.[st.metric] ?? 0)
      return { ...st, count: n, noData: !linkedin?.hasData }
    }

    if (source === 'ga4') {
      const sites = st.site ? [ga4?.[st.site]].filter(Boolean) : Object.values(ga4 ?? {})
      const n = sites.reduce((sum, s) => sum + Number(s.totals?.[st.metric] ?? 0), 0)
      return { ...st, count: n, noData: !sites.some(s => s.hasData) }
    }

    return { ...st, count: 0, noData: true }
  })
}

/** Sum numeric fields across rows → { field: total }. */
export function sumRows(rows, fields) {
  const out = Object.fromEntries(fields.map(f => [f, 0]))
  for (const r of rows ?? []) for (const f of fields) out[f] += Number(r[f] ?? 0)
  return out
}

/** Does this dashboard need LinkedIn / GA4 data at all? */
export function externalNeeds(stages) {
  const srcs = new Set((stages ?? []).map(stageSource))
  return { linkedin: srcs.has('linkedin'), ga4: srcs.has('ga4') }
}
