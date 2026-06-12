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
