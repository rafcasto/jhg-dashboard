// ============================================================
// Where a custom-dashboard stage gets its number from.
//
//   tags      → leads carrying one of the stage's tags (jobhackers_leads)
//   linkedin  → a metric summed from awareness_daily
//   ga4       → a metric summed from site_daily (one site, or all)
//   kit       → a metric summed from email_daily (Kit broadcasts + sequences);
//               `email` narrows it — see EMAIL_SCOPE below
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

// ---- Email scope: what a Kit stage is narrowed to (stage.email) ----
//   ''              all email (broadcasts + sequences)
//   'broadcasts'    every broadcast
//   'sequences'     every sequence
//   'seq:<id>'      one Kit sequence
//   'bc:<id>'       one Kit broadcast
export const EMAIL_SCOPE = { ALL: '', BROADCASTS: 'broadcasts', SEQUENCES: 'sequences' }
export const seqScope = id => `seq:${id}`
export const bcScope  = id => `bc:${id}`

/** Scope keys one email_daily row contributes to (its channel + its own id). */
export function emailRowScopes(row) {
  return row.channel === 'broadcast'
    ? [EMAIL_SCOPE.BROADCASTS, row.broadcast_id ? bcScope(row.broadcast_id) : null].filter(Boolean)
    : [EMAIL_SCOPE.SEQUENCES,  row.sequence_id  ? seqScope(row.sequence_id) : null].filter(Boolean)
}

/** "all email" / "all broadcasts" / "sequence: <name>" / "broadcast: <subject>". */
export function emailScopeLabel(stage, catalog = {}) {
  const s = stage?.email
  if (!s) return 'all email'
  if (s === EMAIL_SCOPE.BROADCASTS) return 'all broadcasts'
  if (s === EMAIL_SCOPE.SEQUENCES)  return 'all sequences'
  if (s.startsWith('seq:')) {
    const seq = (catalog.sequences ?? []).find(x => x.sequence_id === s.slice(4))
    return seq ? `sequence: ${seq.name}` : 'one sequence'
  }
  if (s.startsWith('bc:')) {
    const b = (catalog.broadcasts ?? []).find(x => x.broadcast_id === s.slice(3))
    return b ? `broadcast: ${b.subject ?? b.broadcast_id}` : 'one broadcast'
  }
  return s
}

export const METRICS_BY_SOURCE = { linkedin: LINKEDIN_METRICS, ga4: GA4_METRICS, kit: KIT_METRICS }

export const DEFAULT_METRIC = { linkedin: 'impressions', ga4: 'sessions', kit: 'recipients' }

export const stageSource = stage => stage?.source ?? 'tags'
export const isExternal  = stage => stageSource(stage) !== 'tags'

/** "👀 LinkedIn · Impressions" / "🧭 Google Analytics · Sessions (EEC)" / "✉️ Kit email · Emails sent" / null for tag stages. */
export function describeStageSource(stage, siteLabel, emailCatalog = {}) {
  const src = STAGE_SOURCES.find(s => s.key === stageSource(stage))
  if (!src || src.key === 'tags') return null
  const list = METRICS_BY_SOURCE[src.key] ?? []
  const metric = list.find(m => m.key === stage.metric)?.label ?? stage.metric ?? '?'
  const where = src.key === 'ga4' ? ` · ${siteLabel ?? stage.site ?? 'all sites'}`
              : src.key === 'kit' ? ` · ${emailScopeLabel(stage, emailCatalog)}`
              : ''
  return `${src.emoji} ${src.label} · ${metric}${where}`
}
