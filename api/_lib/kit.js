// Kit (ConvertKit) API v4 — https://developers.kit.com/v4
// Auth: X-Kit-Api-Key header. Keys come from Kit → Settings → Developer.
const BASE = 'https://api.kit.com/v4'

export async function kitFetch(apiKey, path, params = {}) {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, { headers: { 'X-Kit-Api-Key': apiKey, Accept: 'application/json' } })
  if (res.status === 401) throw new Error('Kit rejected the API key — check it in Kit → Settings → Developer')
  if (res.status === 429) throw new Error('Kit rate limit hit — try again in a minute')
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.errors?.join(', ') ?? '' } catch { /* ignore */ }
    throw new Error(`Kit API ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res.json()
}

/** Follow Kit's cursor pagination and return every item under `key`. */
async function paginate(apiKey, path, params, key) {
  const out = []
  let after = null
  do {
    const page = await kitFetch(apiKey, path, { per_page: 500, ...params, after })
    out.push(...(page[key] ?? []))
    after = page.pagination?.has_next_page ? page.pagination.end_cursor : null
  } while (after)
  return out
}

/** Validate a key and return who it belongs to (stored in integrations.config). */
export async function verifyKey(apiKey) {
  const { account, user } = await kitFetch(apiKey, '/account')
  return {
    account_id:    account?.id ?? null,
    account_name:  account?.name ?? null,
    account_email: account?.primary_email_address ?? user?.email ?? null,
  }
}

// ---------- Broadcasts ----------

/**
 * Every broadcast sent on/after `since` with its lifetime stats.
 * GET /v4/broadcasts/stats returns subject, send_at and
 * { recipients, emails_opened, total_clicks, unsubscribes, status } in one go.
 */
export async function broadcastStats(apiKey, { since } = {}) {
  const list = await paginate(apiKey, '/broadcasts/stats',
    { sent_after: since ? new Date(since).toISOString() : undefined }, 'broadcasts')
  return list.filter(notArchived).map(b => {
    const s = b.stats ?? {}
    return {
      broadcast_id: String(b.id),
      subject:      b.subject ?? null,
      send_at:      b.send_at ? new Date(b.send_at).toISOString() : null,
      status:       s.status ?? null,
      recipients:   s.recipients ?? 0,
      opens:        s.emails_opened ?? 0,
      clicks:       s.total_clicks ?? 0,
      unsubscribes: s.unsubscribes ?? 0,
    }
  })
}

/** Kit normally omits archived items from list endpoints; if it ever flags them instead, skip them. */
const notArchived = x => !x.archived && !x.archived_at

/** Only broadcasts that actually went out count towards "emails sent". */
export const wasSent = b => !!b.send_at && b.status !== 'draft' && b.status !== 'scheduled'

// ---------- Sequences ----------

/** All sequences with lifetime stats (GET /v4/sequences?include=stats). */
export async function sequences(apiKey) {
  const list = await paginate(apiKey, '/sequences', { include: 'stats' }, 'sequences')
  return list.filter(notArchived).map(s => {
    const st = s.stats ?? {}
    return {
      sequence_id:      String(s.id),
      name:             s.name ?? `Sequence ${s.id}`,
      active:           !!s.active && !s.hold,
      email_count:      s.email_count ?? 0,
      subscriber_count: s.subscriber_count ?? 0,
      recipients:       st.recipients ?? 0,
      opens:            st.opens ?? 0,
      clicks:           st.clicks ?? 0,
      unsubscribes:     st.email_unsubscribes ?? st.unsubscribers ?? 0,
      bounces:          st.bounces ?? 0,
    }
  })
}

/** Each email in a sequence with its lifetime stats, in send order. */
export async function sequenceEmails(apiKey, sequenceId) {
  const list = await paginate(apiKey, `/sequences/${sequenceId}/emails`, { include: 'stats' }, 'emails')
  return list.map(e => {
    const st = e.stats ?? {}
    return {
      email_id:     String(e.id),
      sequence_id:  String(sequenceId),
      subject:      e.subject ?? null,
      position:     e.position ?? null,
      published:    e.published !== false,
      recipients:   st.recipients ?? 0,
      opens:        st.opens ?? 0,
      clicks:       st.clicks ?? 0,
      unsubscribes: st.email_unsubscribes ?? 0,
    }
  }).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

/**
 * How many subscribers entered a sequence on each day since `sinceDay`
 * ('YYYY-MM-DD'). Returns { 'YYYY-MM-DD': count }.
 */
export async function sequenceEntriesByDay(apiKey, sequenceId, sinceDay) {
  const subs = await paginate(apiKey, `/sequences/${sequenceId}/subscribers`,
    { added_after: sinceDay }, 'subscribers')
  const byDay = {}
  for (const s of subs) {
    const d = s.added_at?.slice(0, 10)
    if (d) byDay[d] = (byDay[d] ?? 0) + 1
  }
  return byDay
}
