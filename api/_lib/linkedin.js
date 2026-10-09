// LinkedIn Marketing / Community Management API client.
//
// Impressions + engagement are only exposed by LinkedIn for *organization
// pages* the member administers (organizationalEntityShareStatistics).
// Personal-profile analytics have no stable public API — for those, the
// dashboard accepts LinkedIn's own analytics export via CSV import.
import { createHmac, randomBytes } from 'node:crypto'

const AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const API       = 'https://api.linkedin.com'
const VERSION   = process.env.LINKEDIN_API_VERSION || '202508'
const SCOPES    = process.env.LINKEDIN_SCOPES
  || 'openid profile r_organization_social rw_organization_admin r_organization_admin'

export const clientId     = () => process.env.LINKEDIN_CLIENT_ID
export const clientSecret = () => process.env.LINKEDIN_CLIENT_SECRET
export const isConfigured = () => !!(clientId() && clientSecret())

// ---------- OAuth state (HMAC-signed, no server session needed) ----------
const b64u = s => Buffer.from(s).toString('base64url')
const sign = payload => createHmac('sha256', clientSecret()).update(payload).digest('base64url')

export function makeState(data) {
  const payload = b64u(JSON.stringify({ ...data, n: randomBytes(8).toString('hex'),
                                        exp: Date.now() + 10 * 60 * 1000 }))
  return `${payload}.${sign(payload)}`
}

export function readState(state) {
  const [payload, sig] = String(state ?? '').split('.')
  if (!payload || !sig || sign(payload) !== sig) throw new Error('Invalid OAuth state')
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
  if (Date.now() > data.exp) throw new Error('OAuth state expired — try connecting again')
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

export const userInfo = token => get(token, '/v2/userinfo', { versioned: false })

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
