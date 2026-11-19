// ============================================================
// Where a custom-dashboard stage gets its number from.
//
//   tags      → leads carrying one of the stage's tags (jobhackers_leads)
//   linkedin  → a metric summed from awareness_daily
//   ga4       → a metric summed from site_daily (one site, or all)
//   kit       → a metric summed from email_daily (Kit broadcasts + sequences);
//               `sequence` narrows it: '' all email | 'broadcasts' | a sequence id
//
// A stage with no `source` is a legacy tag stage.
// ============================================================

export const STAGE_SOURCES = [
  { key: 'tags',     label: 'Lead tags',        emoji: '🏷️' },
  { key: 'linkedin', label: 'LinkedIn',         emoji: '👀' },
  { key: 'ga4',      label: 'Google Analytics', emoji: '🧭' },
  { key: 'kit',      label: 'Kit email',        emoji: '✉️' },
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

export const KIT_METRICS = [
  { key: 'recipients',   label: 'Emails sent' },
  { key: 'opens',        label: 'Opens (unique)' },
  { key: 'clicks',       label: 'Link clicks' },
  { key: 'unsubscribes', label: 'Unsubscribes' },
  { key: 'broadcasts',   label: 'Broadcasts sent' },
  { key: 'entered',      label: 'Entered a sequence' },
]

/** stage.sequence value meaning "broadcasts only" (empty = all email, else a Kit sequence id). */
export const EMAIL_SCOPE_BROADCASTS = 'broadcasts'

/** "all email" / "broadcasts" / "sequence: <name>" — what a Kit stage is narrowed to. */
export function emailScopeLabel(stage, sequences = []) {
  if (!stage?.sequence) return 'all email'
  if (stage.sequence === EMAIL_SCOPE_BROADCASTS) return 'broadcasts only'
  const seq = sequences.find(s => s.sequence_id === stage.sequence)
  return seq ? `sequence: ${seq.name}` : 'one sequence'
}

export const METRICS_BY_SOURCE = { linkedin: LINKEDIN_METRICS, ga4: GA4_METRICS, kit: KIT_METRICS }

export const DEFAULT_METRIC = { linkedin: 'impressions', ga4: 'sessions', kit: 'recipients' }

export const stageSource = stage => stage?.source ?? 'tags'
export const isExternal  = stage => stageSource(stage) !== 'tags'

/** "👀 LinkedIn · Impressions" / "🧭 Google Analytics · Sessions (EEC)" / "✉️ Kit email · Emails sent" / null for tag stages. */
export function describeStageSource(stage, siteLabel, sequences = []) {
  const src = STAGE_SOURCES.find(s => s.key === stageSource(stage))
  if (!src || src.key === 'tags') return null
  const list = METRICS_BY_SOURCE[src.key] ?? []
  const metric = list.find(m => m.key === stage.metric)?.label ?? stage.metric ?? '?'
  const where = src.key === 'ga4' ? ` · ${siteLabel ?? stage.site ?? 'all sites'}`
              : src.key === 'kit' ? ` · ${emailScopeLabel(stage, sequences)}`
              : ''
  return `${src.emoji} ${src.label} · ${metric}${where}`
}
