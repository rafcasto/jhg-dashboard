// Pulls fresh metrics from an integration into the awareness_* / site_daily tables.
import { supabaseAdmin, HttpError, isoDay } from './admin.js'
import { runDailyReport } from './ga4.js'
import * as li from './linkedin.js'

const DAY = 86400000

export async function syncIntegration(id, { days = 90 } = {}) {
  const { data: integ } = await supabaseAdmin.from('integrations').select('*').eq('id', id).single()
  if (!integ) throw new HttpError(404, 'Integration not found')

  const { data: sec } = await supabaseAdmin
    .from('integration_secrets').select('secrets').eq('integration_id', id).single()
  const secrets = sec?.secrets ?? {}

  const end   = new Date()
  const start = new Date(end.getTime() - days * DAY)

  try {
    const summary = integ.kind === 'ga4'
      ? await syncGa4(integ, secrets, start, end)
      : await syncLinkedin(integ, secrets, start, end)

    await supabaseAdmin.from('integrations').update({
      status: 'connected', last_error: null,
      last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id)

    return { id, kind: integ.kind, label: integ.label, ...summary }
  } catch (e) {
    await supabaseAdmin.from('integrations').update({
      status: 'error', last_error: e.message, updated_at: new Date().toISOString(),
    }).eq('id', id)
    throw e
  }
}

export async function syncAll({ days = 14 } = {}) {
  const { data: list } = await supabaseAdmin.from('integrations').select('id, label')
  const results = []
  for (const i of list ?? []) {
    try   { results.push({ ok: true,  ...(await syncIntegration(i.id, { days })) }) }
    catch (e) { results.push({ ok: false, id: i.id, label: i.label, error: e.message }) }
  }
  return results
}

// ---------- GA4 ----------
async function syncGa4(integ, secrets, start, end) {
  const { property_id } = integ.config ?? {}
  if (!property_id) throw new Error('GA4 property id is missing — edit this site in Settings')
  if (!secrets.service_account) throw new Error('Service account JSON is missing — edit this site in Settings')

  const rows = await runDailyReport(secrets.service_account, property_id, isoDay(start), isoDay(end))
  if (rows.length) {
    const { error } = await supabaseAdmin.from('site_daily').upsert(
      rows.map(r => ({ ...r, integration_id: integ.id, site_key: integ.site_key,
                       fetched_at: new Date().toISOString() })),
      { onConflict: 'integration_id,date' })
    if (error) throw new Error(error.message)
  }
  return { days: rows.length }
}

// ---------- LinkedIn ----------
async function syncLinkedin(integ, secrets, start, end) {
  const { secrets: fresh, refreshed } = await li.ensureFreshToken(secrets)
  if (refreshed) {
    await supabaseAdmin.from('integration_secrets')
      .upsert({ integration_id: integ.id, secrets: fresh, updated_at: new Date().toISOString() })
  }
  const token  = fresh.access_token
  const author = integ.config?.author_urn
  if (!author) {
    throw new Error('Choose which LinkedIn Page this account reports on (Settings → LinkedIn → Page)')
  }
  if (!author.startsWith('urn:li:organization:')) {
    throw new Error('LinkedIn only exposes analytics for organization pages via API. ' +
                    'For a personal profile, use "Import CSV" with LinkedIn\'s analytics export.')
  }

  // Per-post lifetime stats
  const posts = await li.listPosts(token, author, 100)
  const stats = await li.postStats(token, author, posts.map(p => p.id))
  const now   = new Date().toISOString()
  const postRows = posts.map(p => {
    const s = stats.get(p.id) ?? {}
    return {
      integration_id: integ.id,
      post_id:        p.id,
      post_url:       li.postUrl(p),
      title:          li.postTitle(p),
      published_at:   p.publishedAt ? new Date(p.publishedAt).toISOString() : null,
      impressions:        s.impressions ?? 0,
      unique_impressions: s.unique_impressions ?? 0,
      likes: s.likes ?? 0, comments: s.comments ?? 0, shares: s.shares ?? 0, clicks: s.clicks ?? 0,
      engagements: (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0) + (s.clicks ?? 0),
      source: 'api', fetched_at: now,
    }
  })
  if (postRows.length) {
    const { error } = await supabaseAdmin.from('awareness_posts')
      .upsert(postRows, { onConflict: 'integration_id,post_id' })
    if (error) throw new Error(error.message)
  }

  // Daily aggregate
  const daily = await li.dailyStats(token, author, start, end)
  if (daily.length) {
    const { error } = await supabaseAdmin.from('awareness_daily').upsert(
      daily.map(d => ({
        ...d, integration_id: integ.id,
        engagements: d.likes + d.comments + d.shares + d.clicks,
        source: 'api', fetched_at: now,
      })),
      { onConflict: 'integration_id,date' })
    if (error) throw new Error(error.message)
  }

  return { posts: postRows.length, days: daily.length }
}
