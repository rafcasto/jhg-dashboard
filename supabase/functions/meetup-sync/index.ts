// meetup-sync — Supabase Edge Function (scheduled every 30 min)
//
// Uses Meetup JWT-bearer auth (RS256) to query gql-ext GraphQL API
// and upsert new RSVPs + members into jobhackers_leads.
//
// Required secrets: MEETUP_CLIENT_ID, MEETUP_MEMBER_ID,
// MEETUP_SIGNING_KEY_ID, MEETUP_PRIVATE_KEY, MEETUP_GROUP_URLNAME

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.1/mod.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const CLIENT_ID      = Deno.env.get('MEETUP_CLIENT_ID')!
const MEMBER_ID      = Deno.env.get('MEETUP_MEMBER_ID')!
const SIGNING_KEY_ID = Deno.env.get('MEETUP_SIGNING_KEY_ID')!
const PRIVATE_KEY    = Deno.env.get('MEETUP_PRIVATE_KEY')!
const GROUP          = Deno.env.get('MEETUP_GROUP_URLNAME')!
const GQL            = 'https://api.meetup.com/gql-ext'

// ── Entry point ───────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') return json({ status: 'ok', fn: 'meetup-sync' })

  try {
    const accessToken = await getMeetupToken()
    const [rsvps, members] = await Promise.all([
      syncRSVPs(accessToken),
      syncNewMembers(accessToken),
    ])
    const result = { rsvps_synced: rsvps, members_synced: members, ok: true }
    console.log('meetup-sync done:', result)
    return json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('meetup-sync error:', msg)
    return json({ error: msg }, 500)
  }
})

// ── JWT-bearer auth ───────────────────────────────────────────

async function getMeetupToken(): Promise<string> {
  const pemBody = PRIVATE_KEY
    .replace('-----BEGIN RSA PRIVATE KEY-----', '')
    .replace('-----END RSA PRIVATE KEY-----', '')
    .replace(/\\n/g, '')
    .replace(/\s/g, '')

  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const now = getNumericDate(0)
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT', kid: SIGNING_KEY_ID },
    { sub: MEMBER_ID, iss: CLIENT_ID, aud: 'api.meetup.com', iat: now, exp: getNumericDate(120) },
    cryptoKey
  )

  const res = await fetch('https://secure.meetup.com/oauth2/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  const data = await res.json() as Record<string, string>
  if (!data.access_token) throw new Error(`Meetup token exchange failed: ${JSON.stringify(data)}`)
  return data.access_token
}

// ── GraphQL helper ────────────────────────────────────────────

async function gql(token: string, query: string) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json() as { data?: unknown; errors?: unknown[] }
  if (data.errors) console.warn('GraphQL warnings:', JSON.stringify(data.errors))
  return data.data as Record<string, unknown>
}

// ── Sync RSVPs from active events ─────────────────────────────

async function syncRSVPs(token: string): Promise<number> {
  const data = await gql(token, `{
    groupByUrlname(urlname: "${GROUP}") {
      events(first: 10, status: ACTIVE) {
        edges {
          node {
            id
            title
            rsvps(first: 200, filter: { status: YES }) {
              edges {
                node {
                  member { name email city }
                }
              }
            }
          }
        }
      }
    }
  }`)

  const eventEdges = ((data?.groupByUrlname as Record<string,unknown>)
    ?.events as Record<string,unknown>)?.edges as unknown[] ?? []

  let total = 0
  for (const edge of eventEdges) {
    const event      = (edge as Record<string,unknown>)?.node as Record<string,unknown>
    const rsvpEdges  = ((event?.rsvps as Record<string,unknown>)?.edges as unknown[]) ?? []
    const eventTitle = String(event?.title ?? 'MEETUP').toUpperCase()

    const leads = rsvpEdges.map((e: unknown) => {
      const m = ((e as Record<string,unknown>)?.node as Record<string,unknown>)
        ?.member as Record<string,string>
      return {
        first_name: splitFirst(m?.name),
        last_name:  splitLast(m?.name),
        email:      m?.email,
        stage:      'awareness',
        source:     'meetup',
        tag:        `EVENT -> RSVP -> ${eventTitle}`,
        location:   m?.city ?? null,
        score:      0,
      }
    }).filter(l => !!l.email)

    if (!leads.length) continue
    const { error } = await supabase.from('jobhackers_leads')
      .upsert(leads, { onConflict: 'email', ignoreDuplicates: true })
    if (error) console.error('RSVP upsert error:', error.message)
    else total += leads.length
  }
  return total
}

// ── Sync new group members (joined in last hour) ──────────────

async function syncNewMembers(token: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const data = await gql(token, `{
    groupByUrlname(urlname: "${GROUP}") {
      memberships(first: 100) {
        edges {
          node { name email city }
          metadata { joinTime }
        }
      }
    }
  }`)

  const edges = ((data?.groupByUrlname as Record<string,unknown>)
    ?.memberships as Record<string,unknown>)?.edges as unknown[] ?? []

  const leads = edges
    .filter((e: unknown) => {
      const joined = ((e as Record<string,unknown>)?.metadata as Record<string,string>)?.joinTime
      return joined && joined >= since
    })
    .map((e: unknown) => {
      const node = e as Record<string,unknown>
      const m    = node?.node as Record<string,string>
      return {
        first_name: splitFirst(m?.name),
        last_name:  splitLast(m?.name),
        email:      m?.email,
        stage:      'awareness',
        source:     'meetup',
        tag:        'COMMUNITY -> MEMBER -> JOIN',
        location:   m?.city ?? null,
        score:      0,
      }
    })
    .filter(l => !!l.email)

  if (!leads.length) return 0
  const { error } = await supabase.from('jobhackers_leads')
    .upsert(leads, { onConflict: 'email', ignoreDuplicates: true })
  if (error) { console.error('Member upsert error:', error.message); return 0 }
  return leads.length
}

// ── Helpers ───────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}
function splitFirst(name?: string) { return (name ?? '').trim().split(/\s+/)[0] ?? '' }
function splitLast(name?: string): string | null {
  const p = (name ?? '').trim().split(/\s+/)
  return p.length > 1 ? p.slice(1).join(' ') : null
}
