// POST /api/integrations/:id/import — manual upload of LinkedIn analytics (admin)
//
// body: { posts: [{ post_id?, post_url?, title?, published_at, impressions,
//                   engagements?, likes?, comments?, shares?, clicks? }],
//         daily: [{ date, impressions, engagements?, ... }] }
import { supabaseAdmin, requireAdmin, sendError, HttpError } from '../../_lib/admin.js'

const num = v => { const n = Number(String(v ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : 0 }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    await requireAdmin(req)
    const { id } = req.query
    const { data: integ } = await supabaseAdmin.from('integrations').select('*').eq('id', id).single()
    if (!integ) throw new HttpError(404, 'Integration not found')
    if (integ.kind !== 'linkedin') throw new HttpError(400, 'CSV import is only for LinkedIn accounts')

    const { posts = [], daily = [] } = req.body ?? {}
    const now = new Date().toISOString()
    let imported = { posts: 0, daily: 0 }

    const postRows = posts
      .filter(p => p.published_at && !Number.isNaN(Date.parse(p.published_at)))
      .map(p => {
        const likes = num(p.likes), comments = num(p.comments), shares = num(p.shares), clicks = num(p.clicks)
        const eng = p.engagements !== undefined && p.engagements !== '' ? num(p.engagements)
                                                                         : likes + comments + shares + clicks
        return {
          integration_id: id,
          post_id:  String(p.post_id || p.post_url || `${p.published_at}|${(p.title ?? '').slice(0, 60)}`),
          post_url: p.post_url || null,
          title:    p.title || null,
          published_at: new Date(p.published_at).toISOString(),
          impressions: num(p.impressions), unique_impressions: num(p.unique_impressions),
          likes, comments, shares, clicks, engagements: eng,
          source: 'csv', fetched_at: now,
        }
      })
    if (postRows.length) {
      const { error } = await supabaseAdmin.from('awareness_posts')
        .upsert(postRows, { onConflict: 'integration_id,post_id' })
      if (error) throw new Error(error.message)
      imported.posts = postRows.length
    }

    const dailyRows = daily
      .filter(d => d.date && !Number.isNaN(Date.parse(d.date)))
      .map(d => {
        const likes = num(d.likes), comments = num(d.comments), shares = num(d.shares), clicks = num(d.clicks)
        const eng = d.engagements !== undefined && d.engagements !== '' ? num(d.engagements)
                                                                         : likes + comments + shares + clicks
        return {
          integration_id: id, date: new Date(d.date).toISOString().slice(0, 10),
          impressions: num(d.impressions), unique_impressions: num(d.unique_impressions),
          likes, comments, shares, clicks, engagements: eng, source: 'csv', fetched_at: now,
        }
      })
    if (dailyRows.length) {
      const { error } = await supabaseAdmin.from('awareness_daily')
        .upsert(dailyRows, { onConflict: 'integration_id,date' })
      if (error) throw new Error(error.message)
      imported.daily = dailyRows.length
    }

    await supabaseAdmin.from('integrations').update({
      status: 'connected', last_error: null, last_synced_at: now, updated_at: now,
    }).eq('id', id)

    return res.status(200).json(imported)
  } catch (e) {
    return sendError(res, e)
  }
}
