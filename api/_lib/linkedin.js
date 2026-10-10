// LinkedIn Marketing / Community Management API client.
//
// Two analytics sources, both from the Community Management API product:
//   • Organization pages the member administers
//       organizationalEntityShareStatistics  (r_organization_*)
//   • The member's own posts
//       memberCreatorPostAnalytics            (r_member_postAnalytics)
//     Daily aggregates across all posts work out of the box. Per-post numbers
//     need post URNs, and listing a member's posts (r_member_social) is a
//     closed permission — so we derive URNs from post URLs that arrived via
//     CSV import and enrich those rows.
//
// Scopes come from the "Community Management API" product. Note LinkedIn
// does NOT allow that product on an app that also has "Sign In with LinkedIn
// using OpenID Connect" — so we identify the member with r_basicprofile +
// /v2/me rather than openid + /v2/userinfo. (If the app does happen to have
// OIDC scopes, userInfo() still tries /v2/userinfo first.)
import { createHmac, randomBytes } from 'node:crypto'

const AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const API       = 'https://api.linkedin.com'
const VERSION   = process.env.LINKEDIN_API_VERSION || '202508'
const SCOPES    = process.env.LINKEDIN_SCOPES
  || 'r_basicprofile r_member_postAnalytics r_organization_social r_organization_admin'

export const clientId     = () => process.env.LINKEDIN_CLIENT_ID
export const clientSecret = () => process.env.LINKEDIN_CLIENT_SECRET
export const isConfigured = () => !!(clientId() && clientSecret())

// ---------- OAuth state (HMAC-signed, no server session needed) ----------
const b64u = s => Buffer.from(s).toString('base64url')
const sign = payload => createHmac('sha256', clientSecret()).update(payload).digest('base64url')

export function makeState(data, { ttlMs = 10 * 60 * 1000 } = {}) {
  const payload = b64u(JSON.stringify({ ...data, n: randomBytes(8).toString('hex'),
                                        exp: Date.now() + ttlMs }))
  return `${payload}.${sign(payload)}`
}

export function readState(state) {
  const [payload, sig] = String(state ?? '').split('.')
  if (!payload || !sig || sign(payload) !== sig) throw new Error('Invalid OAuth state')
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
  if (Date.now() > data.exp) throw new Error(data.invite
    ? 'This invite link has expired — ask for a new one'
    : 'OAuth state expired — try connecting again')
  return data
}

export function authorizationUrl(redirectUri, state) {
  const u = new URL(AUTH_URL)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id',     clientId())
  u.searchParams.set('redirect_uri',  redirectUri)
  u.searchParams.set('scope',         SCOPES)
  u.searchParams.set('state',         state)
  return u.toString()
}

async function tokenRequest(params) {
  const res  = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`LinkedIn token request failed: ${data.error_description ?? data.error ?? res.status}`)
  }
  const now = Date.now()
  return {
    access_token:       data.access_token,
    refresh_token:      data.refresh_token ?? null,
    expires_at:         new Date(now + (data.expires_in ?? 0) * 1000).toISOString(),
    refresh_expires_at: data.refresh_token_expires_in
      ? new Date(now + data.refresh_token_expires_in * 1000).toISOString() : null,
  }
}

export const exchangeCode = (code, redirectUri) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })

/** Returns fresh secrets, refreshing when within 24h of expiry (if a refresh token exists). */
export async function ensureFreshToken(secrets) {
  const soon = Date.now() + 24 * 3600 * 1000
  if (!secrets.expires_at || new Date(secrets.expires_at).getTime() > soon) return { secrets, refreshed: false }
  if (!secrets.refresh_token) {
    if (new Date(secrets.expires_at).getTime() < Date.now()) {
      throw new Error('LinkedIn access token expired — reconnect this account in Settings')
    }
    return { secrets, refreshed: false }
  }
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: secrets.refresh_token })
  return { secrets: { ...secrets, ...fresh, refresh_token: fresh.refresh_token ?? secrets.refresh_token },
           refreshed: true }
}

// ---------- REST helpers ----------
async function get(token, path, { versioned = true } = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0',
      ...(versioned ? { 'LinkedIn-Version': VERSION } : {}),
    },
  })
  const text = await res.text()
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
  if (!res.ok) {
    throw new Error(`LinkedIn ${path.split('?')[0]} → ${res.status}: ${body.message ?? body.raw ?? 'request failed'}`)
  }
  return body
}

/**
 * Who connected. Returns the OIDC-style shape { sub, name, given_name,
 * family_name, picture } regardless of which identity scope the app has.
 */
export async function userInfo(token) {
  // OIDC (openid + profile) — only present if the app has Sign In with LinkedIn
  try {
    const u = await get(token, '/v2/userinfo', { versioned: false })
    if (u?.sub) return u
  } catch { /* fall through to r_basicprofile */ }

  // r_basicprofile (bundled with Community Management API)
  const me = await get(token, '/v2/me?projection=(id,localizedFirstName,localizedLastName)', { versioned: false })
  const given  = me.localizedFirstName ?? ''
  const family = me.localizedLastName ?? ''
  return {
    sub: me.id, given_name: given, family_name: family,
    name: [given, family].filter(Boolean).join(' ') || null,
    picture: null,
  }
}

/** Organization pages the member administers. */
export async function listOrganizations(token) {
  const acl = await get(token, '/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED')
  const urns = [...new Set((acl.elements ?? []).map(e => e.organization).filter(Boolean))]
  const orgs = []
  for (const urn of urns) {
    const id = urn.split(':').pop()
    try {
      const o = await get(token, `/rest/organizations/${id}`)
      orgs.push({ urn, name: o.localizedName ?? `Organization ${id}`, vanity: o.vanityName ?? null })
    } catch {
      orgs.push({ urn, name: `Organization ${id}`, vanity: null })
    }
  }
  return orgs
}

/** Posts authored by an org/member URN, newest first (up to `max`). */
export async function listPosts(token, authorUrn, max = 100) {
  const out = []
  let start = 0
  while (out.length < max) {
    const count = Math.min(50, max - out.length)
    const page  = await get(token,
      `/rest/posts?q=author&author=${encodeURIComponent(authorUrn)}&count=${count}&start=${start}&sortBy=LAST_MODIFIED`)
    const els = page.elements ?? []
    out.push(...els)
    if (els.length < count) break
    start += els.length
  }
  return out
}

const sumStats = s => ({
  impressions:        Number(s?.impressionCount ?? 0),
  unique_impressions: Number(s?.uniqueImpressionsCount ?? 0),
  likes:              Number(s?.likeCount ?? 0),
  comments:           Number(s?.commentCount ?? 0),
  shares:             Number(s?.shareCount ?? 0),
  clicks:             Number(s?.clickCount ?? 0),
})

/** Lifetime stats per post for an organization. Returns Map<postUrn, stats>. */
export async function postStats(token, orgUrn, postUrns) {
  const result = new Map()
  const groups = { share: [], ugcPost: [] }
  for (const u of postUrns) {
    if (u.includes(':share:'))   groups.share.push(u)
    if (u.includes(':ugcPost:')) groups.ugcPost.push(u)
  }
  for (const [param, urns] of [['shares', groups.share], ['ugcPosts', groups.ugcPost]]) {
    for (let i = 0; i < urns.length; i += 20) {
      const batch = urns.slice(i, i + 20).map(encodeURIComponent).join(',')
      const body  = await get(token,
        `/rest/organizationalEntityShareStatistics?q=organizationalEntity` +
        `&organizationalEntity=${encodeURIComponent(orgUrn)}&${param}=List(${batch})`)
      for (const el of body.elements ?? []) {
        const key = el.share ?? el.ugcPost
        if (key) result.set(key, sumStats(el.totalShareStatistics))
      }
    }
  }
  return result
}

/** Daily aggregate stats for an organization between two Dates. */
export async function dailyStats(token, orgUrn, start, end) {
  const body = await get(token,
    `/rest/organizationalEntityShareStatistics?q=organizationalEntity` +
    `&organizationalEntity=${encodeURIComponent(orgUrn)}` +
    `&timeIntervals=(timeRange:(start:${start.getTime()},end:${end.getTime()}),timeGranularityType:DAY)`)
  return (body.elements ?? []).map(el => ({
    date:  new Date(el.timeRange?.start ?? 0).toISOString().slice(0, 10),
    ...sumStats(el.totalShareStatistics),
  }))
}

export function postUrl(post) {
  return `https://www.linkedin.com/feed/update/${post.id}/`
}

export function postTitle(post) {
  const text = (post.commentary ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 120 ? `${text.slice(0, 117)}…` : text || '(no text)'
}

// ---------- Member (personal profile) analytics ----------
// GET /rest/memberCreatorPostAnalytics — r_member_postAnalytics
const pad2   = n => String(n).padStart(2, '0')
const liDate = d => `(day:${d.getUTCDate()},month:${d.getUTCMonth() + 1},year:${d.getUTCFullYear()})`
const MEMBER_DAILY_METRICS = { IMPRESSION: 'impressions', REACTION: 'likes', COMMENT: 'comments', RESHARE: 'shares' }
const MEMBER_TOTAL_METRICS = { ...MEMBER_DAILY_METRICS, MEMBERS_REACHED: 'unique_impressions', LINK_CLICKS: 'clicks' }
const emptyStats = () => ({ impressions: 0, unique_impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 })

/** Per-day totals across all of the authenticated member's posts. */
export async function memberDailyStats(token, start, end) {
  // dateRange is start-inclusive, end-exclusive → push end one day forward
  const endEx = new Date(end.getTime() + 86400000)
  const range = `dateRange=(start:${liDate(start)},end:${liDate(endEx)})`
  const byDay = new Map()
  for (const [metric, field] of Object.entries(MEMBER_DAILY_METRICS)) {
    const body = await get(token,
      `/rest/memberCreatorPostAnalytics?q=me&queryType=${metric}&aggregation=DAILY&${range}`)
    for (const el of body.elements ?? []) {
      const d = el.dateRange?.start
      if (!d) continue
      const date = `${d.year}-${pad2(d.month)}-${pad2(d.day)}`
      const row  = byDay.get(date) ?? { date, ...emptyStats() }
      row[field] += Number(el.count ?? 0)
      byDay.set(date, row)
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Lifetime totals for specific member posts. Returns Map<urn, stats>.
 * URNs that LinkedIn rejects (wrong type / not this member's) are skipped.
 */
export async function memberPostStats(token, postUrns) {
  const result = new Map()
  for (const urn of postUrns) {
    const type  = urn.includes(':ugcPost:') ? 'ugcPost' : 'share'
    const stats = emptyStats()
    let ok = false
    for (const [metric, field] of Object.entries(MEMBER_TOTAL_METRICS)) {
      try {
        const body = await get(token,
          `/rest/memberCreatorPostAnalytics?q=entity&entity=(${type}:${encodeURIComponent(urn)})` +
          `&queryType=${metric}&aggregation=TOTAL`)
        stats[field] = (body.elements ?? []).reduce((n, el) => n + Number(el.count ?? 0), 0)
        ok = true
      } catch {
        if (metric === 'IMPRESSION') break   // URN not resolvable — don't burn 5 more calls
      }
    }
    if (ok) result.set(urn, stats)
  }
  return result
}

/**
 * Candidate post URNs for a LinkedIn post URL. Post URLs carry an *activity*
 * id (…-activity-7325786486870552578-xxxx or urn:li:activity:…); the share /
 * ugcPost URN usually has the same numeric id, so we try both.
 */
export function postUrnCandidates(url) {
  const m = String(url ?? '').match(/activity[-:%3A]+(\d{15,})/i) || String(url ?? '').match(/(?:share|ugcPost)[:%3A]+(\d{15,})/i)
  if (!m) return []
  return [`urn:li:share:${m[1]}`, `urn:li:ugcPost:${m[1]}`]
}
