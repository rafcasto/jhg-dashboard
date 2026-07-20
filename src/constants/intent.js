// ============================================================
// Buying-intent bands — single source of truth for the UI.
//
// Must stay in sync with the CASE expression in
// public.lead_intent_distribution() (migration 013).
//
// Intent is NOT fit. It answers "how close is this lead to buying?",
// derived from stage progression + behavioural tags. A lead in the
// churn stage is always negative; every other stage is always >= 0.
// ============================================================

export const INTENT_BANDS = [
  {
    key: 'churned',
    label: 'Churned',
    emoji: '🧊',
    color: '#dc2626',
    min: -Infinity,
    max: -1,
    description: 'Lead is in the churn stage — negative intent. Win back or suppress.',
  },
  {
    key: 'cold',
    label: 'Cold',
    emoji: '❄️',
    color: '#64748b',
    min: 0,
    max: 19,
    description: 'Aware but barely engaged. Needs nurture before any offer.',
  },
  {
    key: 'warm',
    label: 'Warm',
    emoji: '🌤',
    color: '#f08a1c',
    min: 20,
    max: 39,
    description: 'Engaging with content. Keep feeding value, start seeding the offer.',
  },
  {
    key: 'hot',
    label: 'Hot',
    emoji: '🔥',
    color: '#ea580c',
    min: 40,
    max: 69,
    description: 'Repeatedly taking action. Make the offer.',
  },
  {
    key: 'sales_ready',
    label: 'Sales-ready',
    emoji: '🚀',
    color: '#16a34a',
    min: 70,
    max: Infinity,
    description: 'Deep product engagement. Reach out directly.',
  },
]

export const INTENT_BAND_MAP = Object.fromEntries(INTENT_BANDS.map(b => [b.key, b]))

/** Resolve a raw intent score to its band definition. */
export function intentBand(score) {
  const s = Number(score ?? 0)
  return INTENT_BANDS.find(b => s >= b.min && s <= b.max) ?? INTENT_BAND_MAP.cold
}

/**
 * Width for the intent bar, 0–100.
 * Negative scores render as a full bar in churn red rather than an empty one,
 * because "very churned" should read as a strong signal, not an absent one.
 */
export function intentBarPct(score) {
  const s = Number(score ?? 0)
  if (s < 0) return Math.min(100, (Math.abs(s) / 100) * 100)
  return Math.min(100, s)
}
