// Pulls fresh metrics from an integration into the awareness_* / site_daily / email_broadcasts tables.
import { supabaseAdmin, HttpError, isoDay } from './admin.js'
import { runDailyReport } from './ga4.js'
import * as li from './linkedin.js'
import * as kit from './kit.js'

const DAY = 86400000

// LinkedIn accounts created without OAuth get their numbers from CSV import only.
export const isCsvOnly = integ => integ.kind === 'linkedin' && integ.config?.source === 'csv'

export async function syncIntegration(id, { days = 90 } = {}) {
  const { data: integ } = await supabaseAdmin.from('integrations').select('*').eq('id', id).single()
  if (!integ) throw new HttpError(404, 'Integration not found')
  if (isCsvOnly(integ)) {
    throw new HttpError(400, 'This LinkedIn account is CSV-only — use "Import CSV" with LinkedIn\'s analytics export')
  }

  const { data: sec } = await supabaseAdmin
    .from('integration_secrets').select('secrets').eq('integration_id', id).single()
  const secrets = sec?.secrets ?? {}

  const end   = new Date()
  const start = new Date(end.getTime() - days * DAY)

  try {
    const summary = integ.kind === 'ga4' ? await syncGa4(integ, secrets, start, end)
                  : integ.kind === 'kit' ? await syncKit(integ, secrets, start, end)
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
  const { data: list } = await supabaseAdmin.from('integrations').select('id, label, kind, config')
  const results = []
  for (const i of (list ?? []).filter(i => !isCsvOnly(i))) {
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

// ---------- Kit email ----------
// Broadcast stats are lifetime numbers that keep moving for a while after the
// send (late opens / clicks), so always refresh at least the last 90 days.
async function syncKit(integ, secrets, start, end) {
  if (!secrets.api_key) throw new Error('Kit API key is missing — edit this account in Settings')
  const key   = secrets.api_key
  const since = new Date(Math.min(start.getTime(), end.getTime() - 90 * DAY))
  const now   = new Date().toISOString()
  const today = isoDay(end)
  const stamp = r => ({ ...r, integration_id: integ.id, fetched_at: now })
  const must  = ({ error }) => { if (error) throw new Error(error.message) }

  // Broadcasts — dated, so the send day is the attribution day
  const rows = (await kit.broadcastStats(key, { since })).filter(kit.wasSent)
  if (rows.length) {
    must(await supabaseAdmin.from('email_broadcasts')
      .upsert(rows.map(stamp), { onConflict: 'integration_id,broadcast_id' }))
  }
  // Anything in the refreshed window that Kit no longer returns (archived /
  // deleted / reverted to draft) is gone from the dashboard too.
  await pruneMissing('email_broadcasts', integ.id, 'broadcast_id', rows.map(r => r.broadcast_id),
                     q => q.gte('send_at', since.toISOString()))

  // Sequences — lifetime totals only, so take a dated snapshot each sync;
  // the email_sequence_deltas view turns consecutive snapshots into per-day numbers.
  const seqs = await kit.sequences(key)
  // Archived / deleted sequences: drop the sequence and every table keyed on it.
  const keepSeq = seqs.map(s => s.sequence_id)
  for (const t of ['email_sequences', 'email_sequence_emails', 'email_sequence_snapshots', 'email_sequence_entries']) {
    await pruneMissing(t, integ.id, 'sequence_id', keepSeq)
  }
  if (seqs.length) {
    must(await supabaseAdmin.from('email_sequences')
      .upsert(seqs.map(stamp), { onConflict: 'integration_id,sequence_id' }))
    must(await supabaseAdmin.from('email_sequence_snapshots').upsert(
      seqs.map(s => stamp({ sequence_id: s.sequence_id, date: today,
                            recipients: s.recipients, opens: s.opens, clicks: s.clicks, unsubscribes: s.unsubscribes })),
      { onConflict: 'integration_id,sequence_id,date' }))

    for (const s of seqs) {
      // Per-email breakdown (which nudge does the work)
      const emails = await kit.sequenceEmails(key, s.sequence_id)
      if (emails.length) {
        must(await supabaseAdmin.from('email_sequence_emails')
          .upsert(emails.map(stamp), { onConflict: 'integration_id,email_id' }))
      }
      await pruneMissing('email_sequence_emails', integ.id, 'email_id', emails.map(e => e.email_id),
                         q => q.eq('sequence_id', s.sequence_id))
      // Who entered the sequence, per day — the one dated number Kit exposes.
      // Recounted from scratch for the window so removals don't leave stale days.
      const sinceDay = isoDay(since.getTime() - DAY)
      const byDay = await kit.sequenceEntriesByDay(key, s.sequence_id, sinceDay)
      must(await supabaseAdmin.from('email_sequence_entries').delete()
        .eq('integration_id', integ.id).eq('sequence_id', s.sequence_id).gte('date', sinceDay))
      const entries = Object.entries(byDay).map(([date, entered]) => stamp({ sequence_id: s.sequence_id, date, entered }))
      if (entries.length) must(await supabaseAdmin.from('email_sequence_entries').insert(entries))
    }
  }

  return { broadcasts: rows.length, sequences: seqs.length }
}

/**
 * Delete rows of `table` for this integration whose `col` is NOT in `keep`
 * (optionally narrowed by `scope`). Reads the ids first so the delete is a
 * plain `in (...)` — avoids a giant NOT IN in the query string.
 */
async function pruneMissing(table, integrationId, col, keep, scope = q => q) {
  const { data, error } = await scope(
    supabaseAdmin.from(table).select(col).eq('integration_id', integrationId))
  if (error) throw new Error(error.message)
  const keepSet = new Set(keep.map(String))
  const stale = [...new Set((data ?? []).map(r => String(r[col])))].filter(id => !keepSet.has(id))
  for (let i = 0; i < stale.length; i += 200) {
    const { error: dErr } = await supabaseAdmin.from(table).delete()
      .eq('integration_id', integrationId).in(col, stale.slice(i, i + 200))
    if (dErr) throw new Error(dErr.message)
  }
  return stale.length
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
  if (author.startsWith('urn:li:person:')) return syncMemberProfile(integ, token, start, end)
  if (!author.startsWith('urn:li:organization:')) {
    throw new Error(`Unsupported LinkedIn author "${author}"`)
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

// Personal profile — memberCreatorPostAnalytics (r_member_postAnalytics).
// Daily totals come straight from the API. Per-post numbers are refreshed for
// any post we already know the URL of (from CSV import); LinkedIn doesn't let
// us list a member's posts directly.
async function syncMemberProfile(integ, token, start, end) {
  const now = new Date().toISOString()

  const daily = await li.memberDailyStats(token, start, end)
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

  const { data: known } = await supabaseAdmin.from('awareness_posts')
    .select('post_id, post_url')
    .eq('integration_id', integ.id)
    .not('post_url', 'is', null)
    .gte('published_at', start.toISOString())
    .order('published_at', { ascending: false })
    .limit(40)

  let updated = 0
  for (const row of known ?? []) {
    const candidates = li.postUrnCandidates(row.post_url)
    if (!candidates.length) continue
    const stats = await li.memberPostStats(token, candidates)
    const hit   = candidates.find(u => stats.has(u))
    if (!hit) continue
    const s = stats.get(hit)
    const { error } = await supabaseAdmin.from('awareness_posts').update({
      ...s, engagements: s.likes + s.comments + s.shares + s.clicks,
      source: 'api', fetched_at: now,
    }).eq('integration_id', integ.id).eq('post_id', row.post_id)
    if (!error) updated++
  }

  return { posts: updated, days: daily.length }
}
