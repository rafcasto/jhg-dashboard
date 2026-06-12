// ============================================================
// AAARRR — 6 Pirate Metric stages, single source of truth
// ============================================================

export const STAGES = [
  {
    key:   'awareness',
    label: 'Awareness',
    emoji: '👀',
    color: '#7a1ec2',   // violet — people discovering JHG
    question: 'How are people discovering our product or company?',
  },
  {
    key:   'acquisition',
    label: 'Acquisition',
    emoji: '🎯',
    color: '#0033cc',   // blue — taking the first step
    question: 'How are people taking the first step towards our product?',
  },
  {
    key:   'activation',
    label: 'Activation',
    emoji: '⚡',
    color: '#6bbf6b',   // green-light — taking the actions we want
    question: 'Are these people taking the actions we want them to?',
  },
  {
    key:   'retention',
    label: 'Retention',
    emoji: '🔁',
    color: '#f5d000',   // yellow — continuing to engage
    question: 'Are our activated users continuing to engage with the product?',
  },
  {
    key:   'referral',
    label: 'Referral',
    emoji: '🤝',
    color: '#f08a1c',   // orange — telling others
    question: 'Do users like the product enough to tell others?',
  },
  {
    key:   'revenue',
    label: 'Revenue',
    emoji: '🤑',
    color: '#2f7a3a',   // green-dark — willing to pay
    question: 'Are our personas willing to pay for this product?',
  },
]

export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]))

export const STAGE_KEYS = STAGES.map(s => s.key)

/**
 * Cumulative ("reached this stage") counts.
 *
 * Each lead is stored in exactly ONE stage — its current one. But a lead
 * currently in Acquisition has, by definition, passed through Awareness.
 * For funnel/conversion math the count for stage N is therefore the sum
 * of leads in stage N and every later stage. This makes the top of the
 * funnel equal the total (100%) and keeps KPI cards and funnel consistent.
 */
export function cumulativeMetrics(metrics) {
  const out = {}
  let running = 0
  for (let i = STAGES.length - 1; i >= 0; i--) {
    running += metrics?.[STAGES[i].key] ?? 0
    out[STAGES[i].key] = running
  }
  return out
}

/**
 * Same idea for arbitrary ordered stage arrays (custom dashboards):
 * adds a `cum` field = own count + every later stage's count.
 */
export function cumulativeStages(stages) {
  let running = 0
  const reversed = [...(stages ?? [])].reverse().map(s => {
    running += s.count ?? 0
    return { ...s, cum: running }
  })
  return reversed.reverse()
}
