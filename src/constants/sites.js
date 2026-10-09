// ============================================================
// Downstream sites — the external properties an experiment can
// measure impact on. Each maps to a GA4 integration via site_key.
// Fixed colour order (never cycled) so a site keeps its colour
// regardless of how many are selected.
// ============================================================

export const DEFAULT_SITES = [
  { key: 'eec',     label: 'EEC',          emoji: '🎓', color: '#0891b2' },
  { key: 'webinar', label: 'Webinar',      emoji: '🎥', color: '#b45309' },
  { key: 'compass', label: 'Compass page', emoji: '🧭', color: '#1d4ed8' },
]

export const AWARENESS_COLOR = '#7a1ec2'   // matches the Awareness stage

const EXTRA_COLORS = ['#c2001f', '#0f766e', '#6b7280']

/** Merge the default sites with whatever GA4 properties are actually connected. */
export function mergeSites(ga4Integrations = []) {
  const map = new Map(DEFAULT_SITES.map(s => [s.key, { ...s, connected: false, integrations: [] }]))
  let extra = 0
  for (const g of ga4Integrations) {
    const key = g.site_key
    if (!key) continue
    const existing = map.get(key)
    if (existing) {
      existing.connected = true
      existing.integrations.push(g)
    } else {
      map.set(key, {
        key, label: g.label, emoji: '🌐',
        color: EXTRA_COLORS[extra++ % EXTRA_COLORS.length],
        connected: true, integrations: [g],
      })
    }
  }
  return [...map.values()]
}
