// Google Analytics 4 Data API client — service-account auth, zero dependencies.
//
// The site's NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID (G-XXXXXXX) identifies the
// data stream that *sends* hits. To *read* reports we need the numeric GA4
// property id plus a service account granted "Viewer" on that property.
import { createSign } from 'node:crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE     = 'https://www.googleapis.com/auth/analytics.readonly'

const b64url = s => Buffer.from(s).toString('base64')
  .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

export async function getAccessToken(sa) {
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error('Service account JSON must contain client_email and private_key')
  }
  const now    = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const sig = signer.sign(sa.private_key.replace(/\\n/g, '\n'), 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  `${header}.${claims}.${sig}`,
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Google token exchange failed: ${data.error_description ?? data.error ?? res.status}`)
  }
  return data.access_token
}

const METRICS = ['sessions', 'totalUsers', 'newUsers', 'screenPageViews',
                 'engagedSessions', 'eventCount', 'keyEvents']

/**
 * Daily report for a property between two YYYY-MM-DD dates.
 * Returns rows shaped for the site_daily table.
 */
export async function runDailyReport(sa, propertyId, startDate, endDate) {
  const token = await getAccessToken(sa)
  const pid   = String(propertyId).trim().replace(/^properties\//, '')

  async function run(metrics) {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics:    metrics.map(name => ({ name })),
        orderBys:   [{ dimension: { dimensionName: 'date' } }],
        limit:      10000,
      }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body?.error?.message ?? `GA4 runReport failed (${res.status})`)
    return body
  }

  let body
  try {
    body = await run(METRICS)
  } catch (e) {
    // Older properties may still expose "conversions" instead of "keyEvents"
    if (!/keyEvents/i.test(e.message)) throw e
    body = await run(METRICS.map(m => (m === 'keyEvents' ? 'conversions' : m)))
  }

  const names = (body.metricHeaders ?? []).map(h => h.name)
  return (body.rows ?? []).map(r => {
    const d   = r.dimensionValues[0].value           // YYYYMMDD
    const get = n => Number(r.metricValues[names.indexOf(n)]?.value ?? 0)
    return {
      date:             `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      sessions:         get('sessions'),
      total_users:      get('totalUsers'),
      new_users:        get('newUsers'),
      page_views:       get('screenPageViews'),
      engaged_sessions: get('engagedSessions'),
      event_count:      get('eventCount'),
      key_events:       names.includes('keyEvents') ? get('keyEvents') : get('conversions'),
    }
  })
}
