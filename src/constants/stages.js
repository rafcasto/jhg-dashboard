// ============================================================
// AAARRR — 6 Pirate Metric stages, single source of truth
// ============================================================
//
// `legend`        — plain-English definition of what the stage measures.
// `uniqueByEmail` — when true, the stage is counted as DISTINCT emails
//                   (one person counted once per stage), not raw rows.
//                   Applies to Acquisition, Activation and Retention.
// ============================================================

export const STAGES = [
  {
    key:   'awareness',
    label: 'Awareness',
    emoji: '👀',
    color: '#7a1ec2',   // violet — people discovering JHG
    question: 'How are people discovering our product or company?',
    legend: 'How many people do you reach and drive to your website?',
  },
  {
    key:   'acquisition',
    label: 'Acquisition',
    emoji: '🎯',
    color: '#0033cc',   // blue — taking the first step
    question: 'How are people taking the first step towards our product?',
    legend: 'How many people visit your website / product landing page and become interested prospects (they sign up)?',
    uniqueByEmail: true,
  },
  {
    key:   'activation',
    label: 'Activation',
    emoji: '⚡',
    color: '#6bbf6b',   // green-light — taking the actions we want
    question: 'Are these people taking the actions we want them to?',
    legend: 'How many people have their first gratifying user experience (aha moment) — connecting your landing-page promise (UVP) to your product? i.e. how many try your product?',
    uniqueByEmail: true,
  },
  {
    key:   'retention',
    label: 'Retention',
    emoji: '🔁',
    color: '#f5d000',   // yellow — continuing to engage
    question: 'Are our activated users continuing to engage with the product?',
    legend: 'How many people come back and use your product again (engagement)?',
    uniqueByEmail: true,
  },
  {
    key:   'referral',
    label: 'Referral',
    emoji: '🤝',
    color: '#f08a1c',   // orange — telling others
    question: 'Do users like the product enough to tell others?',
    legend: 'How many happy customers refer friends to your business?',
  },
  {
    key:   'revenue',
    label: 'Revenue',
    emoji: '🤑',
    color: '#2f7a3a',   // green-dark — willing to pay
    question: 'Are our personas willing to pay for this product?',
    legend: 'How many people buy your product and use it in a meaningful way? (Most products offer a trial period where a customer may return the product for a refund.)',
  },
]

export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]))

export const STAGE_KEYS = STAGES.map(s => s.key)
