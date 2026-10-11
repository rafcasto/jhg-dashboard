// ============================================================
// Where a custom-dashboard stage gets its number from.
//
//   tags      → leads carrying one of the stage's tags (jobhackers_leads)
//   linkedin  → a metric summed from awareness_daily
//   ga4       → a metric summed from site_daily (one site, or all)
//
// A stage with no `source` is a legacy tag stage.
// ============================================================

export const STAGE_SOURCES = [
  { key: 'tags',     label: 'Lead tags',        emoji: '🏷️' },
  { key: 'linkedin', label: 'LinkedIn',         emoji: '👀' },
  { key: 'ga4',      label: 'Google Analytics', emoji: '🧭' },
]

export const LINKEDIN_METRICS = [
  { key: 'impressions',        label: 'Impressions' },
  { key: 'unique_impressions', label: 'Members reached' },
  { key: 'engagements',        label: 'Engagements' },
  { key: 'likes',              label: 'Reactions' },
  { key: 'comments',           label: 'Comments' },
  { key: 'shares',             label: 'Reposts' },
  { key: 'clicks',             label: 'Clicks' },
]

export const GA4_METRICS = [
  { key: 'sessions',         label: 'Sessions (visits)' },
  { key: 'total_users',      label: 'Users' },
  { key: 'new_users',        label: 'New users' },
  { key: 'page_views',       label: 'Page views' },
  { key: 'engaged_sessions', label: 'Engaged sessions' },
  { key: 'key_events',       label: 'Key events' },
]

export const DEFAULT_METRIC = { linkedin: 'impressions', ga4: 'sessions' }

export const stageSource = stage => stage?.source ?? 'tags'
export const isExternal  = stage => stageSource(stage) !== 'tags'

/** "👀 LinkedIn · Impressions" / "🧭 Google Analytics · Sessions (EEC)" / null for tag stages. */
export function describeStageSource(stage, siteLabel) {
  const src = STAGE_SOURCES.find(s => s.key === stageSource(stage))
  if (!src || src.key === 'tags') return null
  const list = src.key === 'linkedin' ? LINKEDIN_METRICS : GA4_METRICS
  const metric = list.find(m => m.key === stage.metric)?.label ?? stage.metric ?? '?'
  const where = src.key === 'ga4' ? ` · ${siteLabel ?? stage.site ?? 'all sites'}` : ''
  return `${src.emoji} ${src.label} · ${metric}${where}`
}
