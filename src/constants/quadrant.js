// ============================================================
// Lead-score quadrant — buying intent (Y) × fit (X)
//
// Intent: how ready to buy (stage + tags, decayed).
// Fit:    are they the right customer (quiz ICP verdict).
//
// Segment keys must match public.people_quadrant() in migration 017.
// Recommended actions live here so they're easy to edit without a deploy
// of the database.
// ============================================================

export const SEGMENTS = {
  priority: {
    key: 'priority',
    title: 'Priority',
    fit: 'high', intent: 'high',
    emoji: '🎯',
    color: '#16a34a',
    tagline: 'Right customer, ready to buy',
    action: 'Reach out personally now. Book a call, make the offer — this is where closed revenue comes from. Do not let these sit in a nurture sequence.',
  },
  nurture: {
    key: 'nurture',
    title: 'Nurture',
    fit: 'high', intent: 'low',
    emoji: '🌱',
    color: '#0369a1',
    tagline: 'Right person, not ready yet',
    action: 'Keep feeding value and build the relationship. Re-engage with case studies and proof before you pitch — pushing an offer now burns the lead.',
  },
  qualify: {
    key: 'qualify',
    title: 'Qualify',
    fit: 'low', intent: 'high',
    emoji: '🔍',
    color: '#f08a1c',
    tagline: 'Eager, but may not be your ICP',
    action: 'Qualify before you invest 1:1 time. Point them to self-serve or a lower-touch offer; only escalate if they clear your fit bar on a call.',
  },
  disqualify: {
    key: 'disqualify',
    title: 'Deprioritize',
    fit: 'low', intent: 'low',
    emoji: '🧊',
    color: '#94a3b8',
    tagline: 'Wrong fit, low intent',
    action: 'Do not spend 1:1 time here. Automated, low-effort nurture only — or let them lapse. Revisit only if their fit or intent changes.',
  },
}

export const SEGMENT_ORDER = ['priority', 'nurture', 'qualify', 'disqualify']

// Unknown fit is not a quadrant cell — it's everyone who never took the
// quiz, so there's no way to place them on the fit axis.
export const UNKNOWN_FIT = {
  key: 'unknown',
  title: 'Fit unknown',
  emoji: '❓',
  color: '#7a1ec2',
  tagline: 'Never took the quiz',
  action: 'You can’t gauge fit until they answer the quiz. Send them to it — a quiz completion turns an unknown into a placeable lead.',
}

/** Grid position of each cell in a 2×2 where Y=intent (top=high), X=fit (right=high). */
export const CELL_AT = {
  'high-high': 'priority',   // top-right
  'high-low':  'qualify',    // top-left  (high intent, low fit)
  'low-high':  'nurture',    // bottom-right (low intent, high fit)
  'low-low':   'disqualify', // bottom-left
}
